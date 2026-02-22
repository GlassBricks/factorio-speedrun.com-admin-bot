import { container } from "@sapphire/framework"
import { Client, Events, Message, SendableChannels } from "discord.js"
import { parse } from "iso8601-duration"
import { scheduleJob } from "node-schedule"
import {
  Category,
  Game,
  getAllRuns,
  getGame,
  getLeaderboard,
  getUser,
  Leaderboard,
  Player,
  Run,
  User,
  Variable,
} from "src-ts"
import { AnnounceSrcSubmissionsConfig } from "../config-file.js"
import { SrcRun, SrcRunStatus } from "../db/index.js"
import { ReplayVerification } from "../db/replay-verification.js"
import type { RunData } from "../db/run-data.js"
import { createLogger } from "../logger.js"
import twitchClient from "../twitch.js"
import { assertNever, botCanSendInChannel, formatDuration, getAllRunsSince } from "../utils.js"
import { formatVerificationStatus, renderEmbed } from "./embed-fields.js"

export function setUpAnnounceSrcSubmissions(client: Client, config: AnnounceSrcSubmissionsConfig | undefined) {
  if (config) client.once(Events.ClientReady, (readyClient) => setup(readyClient, config))
}

const MESSAGE_VERSION = 15

const runEmbeds = "players"
type RunWithEmbeds = Run<typeof runEmbeds>

type VideoProvider = "twitch" | "youtube"
const videoProviderRegexes: Record<VideoProvider, RegExp> = {
  twitch: /^(?:https?:\/\/)?(?:www\.)?twitch\.tv\/videos\/(\d+)/,
  youtube: /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
}

const TwitchVideoMessage = {
  archive: "[Twitch VOD](%url) ⚠️ **Not permanent!!**",
  highlight: "[Twitch highlight](%url) ⚠️ **Not permanent!!**",
  upload: "[Uploaded Twitch video](%url)",
  offline: "[Offline Twitch video](%url) (Twitch returned 404)",
  unknown: "[Twitch video](%url), status unknown. (Fix me @GlassBricks !)",
}

const YoutubeVideoMessage = "[YouTube video](%url)"
const NoVideoMessage = "None found"

const StatusMessage: Partial<Record<SrcRunStatus, string>> = {
  [SrcRunStatus.New]: "⏳ new",
  [SrcRunStatus.Verified]: "verified by %p",
  [SrcRunStatus.Rejected]: "❌ rejected by %p",
  [SrcRunStatus.SelfVerified]: "auto-verified",
}

function isChallengerRun(
  leaderboard: Leaderboard<"category"> | undefined,
  _run: RunWithEmbeds,
  _category: Category | undefined,
  place: number,
): boolean {
  return (leaderboard?.runs?.length ?? 0) >= 3 && place <= 3
}

function findPlaceInLeaderboard(leaderboard: Leaderboard<"category">, run: RunWithEmbeds) {
  // find first run with slower time; this run replaces it
  const index = leaderboard.runs.findIndex((x) => x.run.times.primary_t >= run.times.primary_t || x.run.id === run.id)
  if (index === -1) {
    return leaderboard.runs.length + 1
  }
  return index + 1
}

const logger = createLogger("[AnnounceSrcSubmissions]")

async function getActualLeaderboard(game: GameData, run: RunWithEmbeds): Promise<Leaderboard<"category"> | undefined> {
  const leaderboardRunVars: Record<string, string> = {}
  for (const variableId in run.values) {
    const varData = game.variablesById.get(variableId)
    if (varData?.["is-subcategory"]) {
      leaderboardRunVars[variableId] = run.values[variableId]!
    }
  }

  return await getLeaderboard(run.game, run.category, leaderboardRunVars, { embed: "category" })
}

function getPlayerNames(players: Player[]): string[] {
  return players.map((player) => (player.rel == "user" ? player.names.international : `(Guest) ${player.name}`))
}

async function buildRunData(gameIds: string[], run: RunWithEmbeds): Promise<RunData> {
  const gameData = await getGameCached(run.game)
  const game = gameData.game
  const leaderboard = await getActualLeaderboard(gameData, run)
  const category = leaderboard && (Array.isArray(leaderboard.category.data) ? undefined : leaderboard.category.data)

  const place = leaderboard ? findPlaceInLeaderboard(leaderboard, run) : undefined
  const categoryName = category?.name ?? "Unknown category"
  const gameName = game.names.international
  const durationStr = formatDuration(parse(run.times.primary))

  return {
    gameId: game.id,
    gameName,
    categoryName,
    players: getPlayerNames(run.players.data),
    time: durationStr,
    place: place ?? -1,
    isChallengerRun:
      category !== undefined && place !== undefined && isChallengerRun(leaderboard, run, category, place),
    firstTimeSubmissionPlayers: [],
  }
}

async function isNewSubmitter(gameIds: string[], playerId: string, excludedRunId: string): Promise<boolean> {
  for (const gameId of gameIds) {
    const run = await getAllRuns(
      {
        game: gameId,
        user: playerId,
        status: "verified",
      },
      { max: 1 },
    )
    if (run.some((r) => r.id !== excludedRunId)) return false
  }
  return true
}

async function findNewPlayers(gameIds: string[], players: Player[], excludedRunId: string): Promise<string[]> {
  const result = []
  for (const player of players) {
    if (player.rel !== "user") continue
    if (await isNewSubmitter(gameIds, player.id, excludedRunId)) {
      result.push(player.names.international)
    }
  }
  return result
}

function setup(client: Client<true>, config: AnnounceSrcSubmissionsConfig) {
  scheduleJob("processSrcSubmissions", config.cronSchedule, () => logErrors(run())).invoke()

  const gameIds = config.games.map((x) => x.id)

  async function run() {
    logger.info("Starting announce SRC submissions")
    clearCaches()

    const notifyChannel = await client.channels.fetch(config.channelId)
    if (!notifyChannel?.isSendable() || !(await botCanSendInChannel(notifyChannel))) {
      logger.error("Channel not found or not a text channel! Cannot announce submissions.")
      return
    }

    logger.debug("Finding runs")
    const allRuns = await getRunsToProcess(gameIds)
    logger.debug("Processing", allRuns.length, "runs")
    for (const run of allRuns) {
      await processRun(run, notifyChannel)
    }
    logger.info("Done")
  }

  async function processRun({ srcRun, dbRun }: RunWithMaybeDbRun, notifyChannel: SendableChannels) {
    logger.debug("Processing run:", srcRun.id)

    const status = getRunStatus(srcRun)
    const currentVideoProof = findVideoUrl(srcRun)

    let message: Message | undefined
    const isNewMessage = !dbRun
    if (!dbRun) {
      const runData = await buildRunData(gameIds, srcRun)
      dbRun = new SrcRun({
        runId: srcRun.id,
        submissionTime: new Date(srcRun.submitted!),
        messageChannelId: null,
        messageId: null,
        messageVersion: MESSAGE_VERSION,
        lastStatus: SrcRunStatus.Unknown,
        videoProof: currentVideoProof?.url,
        newPlayerAnnounceChecked: false,
        runData,
      })
    }

    const isOutdatedMessage = dbRun.messageVersion !== MESSAGE_VERSION
    const needsRunDataRefresh = isOutdatedMessage || !dbRun.runData
    const statusChanged = dbRun.lastStatus !== status
    const isVerified = status === SrcRunStatus.Verified || status === SrcRunStatus.SelfVerified
    const shouldCheckNewPlayers = !dbRun.newPlayerAnnounceChecked && (isNewMessage || statusChanged) && isVerified

    const shouldAwaitUpdate = shouldCheckNewPlayers
    const promise = (async () => {
      if (needsRunDataRefresh) {
        dbRun.runData = await buildRunData(gameIds, srcRun)
      }

      if (statusChanged || isNewMessage || needsRunDataRefresh) {
        dbRun.lastStatus = status
        dbRun.statusText = await getStatusText(srcRun)
      }

      const videoChanged = dbRun.videoProof !== currentVideoProof?.url
      if (videoChanged || needsRunDataRefresh) {
        dbRun.videoProof = currentVideoProof?.url
        dbRun.videoProofText = await fetchVideoText(currentVideoProof)
      }

      if (shouldCheckNewPlayers) {
        const newPlayers = await findNewPlayers(gameIds, srcRun.players.data, srcRun.id)
        if (newPlayers.length > 0) {
          dbRun.runData = { ...dbRun.runData!, firstTimeSubmissionPlayers: newPlayers }
        }
      }

      const shouldEditMessage = needsRunDataRefresh || statusChanged || videoChanged || isNewMessage

      if (dbRun.runData && (isNewMessage || shouldEditMessage)) {
        const embed = await buildEmbedFromDb(dbRun)

        if (isNewMessage) {
          logger.info("Creating run message", srcRun.id)
          message = await notifyChannel.send({ embeds: [embed] })
          dbRun.messageId = message.id
          dbRun.messageChannelId = message.channelId
        } else {
          logger.debug("Editing message", srcRun.id)
          message ??= await fetchDiscordMessage(dbRun)
          if (message) {
            await message.edit({ content: null, embeds: [embed], flags: "0" })
          }
        }
        dbRun.messageVersion = MESSAGE_VERSION
      } else {
        logger.debug("No changes for run", srcRun.id)
      }

      if (shouldCheckNewPlayers) {
        launch(announceNewPlayers(notifyChannel, dbRun.runData?.firstTimeSubmissionPlayers))
        dbRun.newPlayerAnnounceChecked = true
      }

      launch(dbRun.save())
    })()
    if (shouldAwaitUpdate) {
      await promise
    } else {
      launch(promise)
    }
  }

  async function buildEmbedFromDb(dbRun: SrcRun) {
    const verification = await ReplayVerification.findByPk(dbRun.runId)

    return renderEmbed({
      runData: dbRun.runData!,
      runId: dbRun.runId,
      submissionTime: dbRun.submissionTime,
      lastStatus: dbRun.lastStatus,
      videoProof: dbRun.videoProofText ?? "None found",
      statusText: dbRun.statusText ?? "⏳ new",
      replayVerification: verification ? formatVerificationStatus(verification.status, verification.message) : null,
    })
  }

  function joinWordsAnd(words: string[]): string {
    if (words.length === 0) return ""
    if (words.length === 1) return words[0]!
    if (words.length === 2) return words.join(" and ")
    return `${words.slice(0, -1).join(", ")}, and ${words[words.length - 1]}`
  }

  async function announceNewPlayers(channel: SendableChannels, newPlayers: string[] | undefined) {
    if (config.announceNewPlayersMessage && newPlayers && newPlayers.length > 0) {
      await channel.send({
        content: config.announceNewPlayersMessage.message.replace("%p", joinWordsAnd(newPlayers)),
        allowedMentions: config.announceNewPlayersMessage.allowedMentions,
      })
    }
  }
}

interface RunWithMaybeDbRun {
  srcRun: RunWithEmbeds
  dbRun?: SrcRun
}

const messageUpdateMaxAge = 30
async function getRunsToProcess(gameIds: string[]): Promise<RunWithMaybeDbRun[]> {
  const allDbRuns = await SrcRun.findAll({ order: [["submissionTime", "desc"]] })
  const latestSavedSubmission = allDbRuns[0]?.submissionTime ?? new Date(Date.now() - 60 * 60 * 24 * 1000 * 7)
  const earliestDate = new Date(Date.now() - 60 * 60 * 24 * 1000 * messageUpdateMaxAge)

  const newStatusRuns = gameIds.map((gameId) =>
    getAllRuns({
      game: gameId,
      status: "new",
      embed: runEmbeds,
      max: 200,
    }),
  )
  const allExistingRuns = gameIds.map((gameId) =>
    getAllRunsSince(earliestDate, {
      game: gameId,
      orderby: "date",
      direction: "desc",
      embed: runEmbeds,
      max: 200,
    }),
  )

  const allDbRunsMap = new Map(allDbRuns.map((run) => [run.runId, run]))

  const allRuns = (await Promise.all([...newStatusRuns, ...allExistingRuns])).flat()

  const resultMap = new Map<string, RunWithMaybeDbRun>()
  for (const run of allRuns) {
    if (!run.submitted) continue
    if (resultMap.has(run.id)) continue
    const dbRun = allDbRunsMap.get(run.id)

    const shouldIncludeInResult =
      dbRun !== undefined ||
      run.status.status === "new" ||
      new Date(run.submitted).getTime() > latestSavedSubmission.getTime()
    if (shouldIncludeInResult) {
      resultMap.set(run.id, { srcRun: run, dbRun: dbRun })
    }
  }
  const result = Array.from(resultMap.values())
  result.sort((a, b) => new Date(a.srcRun.submitted!).getTime() - new Date(b.srcRun.submitted!).getTime())
  return result
}

interface VideoUrlInfo {
  provider: VideoProvider
  url: string
  id: string
}

function findVideoUrlFromUrl(url: string): VideoUrlInfo | undefined {
  for (const [provider, regex] of Object.entries(videoProviderRegexes)) {
    const match = url.match(regex)
    if (match) {
      return {
        provider: provider as VideoProvider,
        url,
        id: match[1]!,
      }
    }
  }
  return undefined
}

function findVideoUrl(run: RunWithEmbeds): VideoUrlInfo | undefined {
  const videoLinks = run.videos?.links
  if (!videoLinks) return undefined

  for (const link of videoLinks) {
    const url = findVideoUrlFromUrl(link.uri)
    if (url) return url
  }
  return undefined
}

async function fetchVideoMessageTemplate(url: VideoUrlInfo | undefined): Promise<string> {
  if (url == undefined) {
    return NoVideoMessage
  } else if (url.provider === "twitch") {
    const video = await twitchClient
      .getVideo(url.id)
      .then((video) => video?.type ?? "offline")
      .catch((e) => {
        logger.error("Error fetching twitch video", e)
        return "unknown" as const
      })

    return TwitchVideoMessage[video]
  } else if (url.provider === "youtube") {
    return YoutubeVideoMessage
  } else {
    assertNever(url.provider)
  }
}

async function fetchVideoText(url: VideoUrlInfo | undefined): Promise<string> {
  return (await fetchVideoMessageTemplate(url)).replace("%url", url?.url ?? "")
}

export async function fetchDiscordMessage(dbRun: SrcRun): Promise<Message | undefined> {
  if (!dbRun.messageChannelId || !dbRun.messageId) return undefined
  let message: Message | undefined
  try {
    const channel = await container.client.channels.fetch(dbRun.messageChannelId)
    message = channel?.isTextBased() ? await channel.messages.fetch(dbRun.messageId) : undefined
  } catch (e) {
    logger.warn("Unable to fetch message for run:", e)
  }
  return message
}

function getRunStatus(run: RunWithEmbeds): SrcRunStatus {
  const examinerId = "examiner" in run.status ? run.status.examiner : undefined
  const isSelfVerified =
    run.status.status == "verified" && run.players.data.some((x: Player) => x.rel === "user" && x.id === examinerId)

  if (isSelfVerified) return SrcRunStatus.SelfVerified
  switch (run.status.status) {
    case "new":
      return SrcRunStatus.New
    case "verified":
      return SrcRunStatus.Verified
    case "rejected":
      return SrcRunStatus.Rejected
    default:
      return SrcRunStatus.New
  }
}

async function getStatusText(run: RunWithEmbeds) {
  const status = getRunStatus(run)
  const statusMessage = StatusMessage[status] ?? "Unknown"
  if (statusMessage.includes("%p")) {
    const examinerName = "examiner" in run.status ? (await getUserCached(run.status.examiner)).names.international : ""
    return statusMessage.replace("%p", examinerName)
  }
  return statusMessage
}

async function logErrors<T>(promise: Promise<T>): Promise<T | undefined> {
  try {
    return await promise
  } catch (e: unknown) {
    logger.error(e)
    if (typeof e === "object" && e !== null) {
      if ("parent" in e) {
        logger.error(e.parent)
      }
      if ("original" in e) {
        logger.error(e.original)
      }
    }
    return undefined
  }
}

function launch<T>(promise: Promise<T>) {
  void logErrors(promise)
}

interface GameData {
  game: Game<"variables">
  variablesById: Map<string, Variable>
}

interface Cache<T> {
  clear(): void
  get(id: string): Promise<T>
}

const caches: Cache<unknown>[] = []

function makeCache<T>(getById: (id: string) => Promise<T>): Cache<T> {
  const cache = new Map<string, Promise<T>>()
  const result: Cache<T> = {
    clear: () => cache.clear(),
    get(id: string): Promise<T> {
      const existing = cache.get(id)
      if (existing) return existing
      const promise = getById(id).catch((e) => {
        container.logger.error(e)
        cache.delete(id)
        throw e
      })
      cache.set(id, promise)
      return promise
    },
  }
  caches.push(result)
  return result
}

const userCache: Cache<User> = makeCache(getUser)
const gameCache: Cache<GameData> = makeCache(async (id) => {
  const game = await getGame(id, { embed: "variables" })
  const variables = new Map(game.variables.data.map((x) => [x.id, x]))
  return { game, variablesById: variables }
})

function clearCaches() {
  caches.forEach((cache) => cache.clear())
}

function getUserCached(userId: string) {
  return userCache.get(userId)
}
function getGameCached(gameId: string) {
  return gameCache.get(gameId)
}
