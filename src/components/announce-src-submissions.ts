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
import { SrcRun, SrcRunStatus } from "../db/index.js"
import {
  APIEmbedField,
  Client,
  Embed,
  EmbedBuilder,
  Events,
  HexColorString,
  Message,
  SendableChannels,
} from "discord.js"
import { AnnounceSrcSubmissionsConfig } from "../config-file.js"
import {
  assertNever,
  botCanSendInChannel,
  formatDuration,
  formatPlace,
  getAllRunsSince,
  statusStrToStatus,
} from "../utils.js"
import { createLogger } from "../logger.js"
import { scheduleJob } from "node-schedule"
import { parse } from "iso8601-duration"
import { container } from "@sapphire/framework"
import twitchClient from "../twitch.js"

export function setUpAnnounceSrcSubmissions(client: Client, config: AnnounceSrcSubmissionsConfig | undefined) {
  if (config) client.once(Events.ClientReady, (readyClient) => setup(readyClient, config))
}

/**
 * Update this if the message format changes
 */
const MESSAGE_VERSION = 11

const runEmbeds = "players"
type RunWithEmbeds = Run<typeof runEmbeds>

type VideoProvider = "twitch" | "youtube"
const videoProviderConfigs: Record<VideoProvider, RegExp> = {
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

enum RunStatus {
  New = "New",
  Verified = "Verified",
  Rejected = "Rejected",
  SelfVerified = "SelfVerified",
}

const StatusMessage: Record<RunStatus, string> = {
  [RunStatus.New]: "⏳ new",
  [RunStatus.Verified]: "verified by %p",
  [RunStatus.Rejected]: "❌ rejected by %p",
  [RunStatus.SelfVerified]: "auto-verified",
}

const StatusColor: Record<RunStatus, HexColorString> = {
  [RunStatus.New]: "#ffee20",
  [RunStatus.Verified]: "#20ff20",
  [RunStatus.Rejected]: "#ff5050",
  [RunStatus.SelfVerified]: "#75ff94",
}

// hardcoded for now
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

interface RunMessageParts {
  title: string
  description: string
  thumbnail: string
  timestamp: Date
  color: HexColorString

  firstTimeSubmissionPlayers: string[]
  isChallengerRun: boolean
  place: number | undefined
  videoProof: string
  status: string
}

/**
 * Does not include: videoProof, status
 *
 * That will be filled in later in `processRun`
 */
async function getInitialMessage(gameIds: string[], run: RunWithEmbeds): Promise<RunMessageParts> {
  const gameData = await getGameCached(run.game)
  const game = gameData.game
  const leaderboard = await getActualLeaderboard(gameData, run)
  const category = leaderboard && (Array.isArray(leaderboard.category.data) ? undefined : leaderboard.category.data)

  const place = leaderboard && findPlaceInLeaderboard(leaderboard, run)
  function getPlayerNamesStr(players: Player[]): string {
    return players
      .map((player) => (player.rel == "user" ? player.names.international : `(Guest) ${player.name}`))
      .join(", ")
  }
  const playerNames =
    run.players.data.length <= 4
      ? getPlayerNamesStr(run.players.data)
      : getPlayerNamesStr(run.players.data.slice(0, 3)) + `, and ${run.players.data.length - 3} more`

  const categoryName = category?.name ?? "Unknown category"
  const gameName = game.names.international
  const durationStr = formatDuration(parse(run.times.primary))
  return {
    title: "Run submission",
    description: `## ${gameName} | [${categoryName} by ${playerNames} in ${durationStr}](${run.weblink})`,
    thumbnail: `https://www.speedrun.com/static/game/${game.id}/cover.png`,
    timestamp: new Date(run.submitted!),
    color: StatusColor[getRunStatus(run)],

    isChallengerRun:
      category !== undefined && place !== undefined && isChallengerRun(leaderboard, run, category, place),
    place: place ?? -1,
    firstTimeSubmissionPlayers: [],
    videoProof: "",
    status: "",
  }
}

async function isNewSubmitter(gameIds: string[], playerId: string): Promise<boolean> {
  for (const gameId of gameIds) {
    const run = await getAllRuns(
      {
        game: gameId,
        user: playerId,
        status: "verified",
      },
      { max: 1 },
    )
    if (run.length > 0) return false
  }
  return true
}

async function findNewPlayers(gameIds: string[], players: Player[]): Promise<string[]> {
  const result = []
  for (const player of players) {
    if (player.rel !== "user") continue
    if (await isNewSubmitter(gameIds, player.id)) {
      result.push(player.names.international)
    }
  }
  return result
}

function getEmbedFields(parts: Partial<RunMessageParts>, fromExisting?: APIEmbedField[]): APIEmbedField[] {
  function field(
    name: string,
    keys: (keyof RunMessageParts)[],
    valueFromParts: string | false | undefined,
    inline: boolean = false,
  ): APIEmbedField | undefined {
    if (!keys.every((k) => k in parts)) {
      return fromExisting?.find((x) => x.name === name)
    } else if (!valueFromParts) {
      return undefined
    } else
      return {
        name,
        value: valueFromParts,
        inline,
      }
  }

  return [
    field(
      "🎉 First time submission",
      ["firstTimeSubmissionPlayers"],
      parts.firstTimeSubmissionPlayers?.join(", "),
      true,
    ),
    field(
      "🏆 Challenger run",
      ["isChallengerRun", "place"],
      parts.isChallengerRun && parts.place !== undefined && `May be ${getPlaceText(parts.place)}!`,
      true,
    ),
    field(
      "Place",
      ["place", "isChallengerRun"],
      !parts.isChallengerRun && parts.place !== undefined && getPlaceText(parts.place),
      true,
    ),
    field("Video proof", ["videoProof"], parts.videoProof),
    field("Status", ["status"], parts.status, true),
  ].filter((x): x is APIEmbedField => !!x)
}
function getPlaceText(place: number | null) {
  return place === null
    ? "Unknown"
    : place === 1
      ? "🥇 A New World Record"
      : place === 2
        ? "🥈"
        : place === 3
          ? "🥉"
          : formatPlace(place)
}

function isEmptyObject(obj: Record<string, unknown>) {
  // noinspection LoopStatementThatDoesntLoopJS
  for (const _ in obj) {
    return false
  }
  return true
}
function setup(client: Client<true>, config: AnnounceSrcSubmissionsConfig) {
  scheduleJob("processSrcSubmissions", config.cronSchedule, () => logErrors(run()))
    // Run once on startup
    .invoke()

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

    const status = statusStrToStatus(srcRun.status.status)
    const currentVideoProof = findVideoUrl(srcRun)

    let message: Message | undefined
    const isNewMessage = !dbRun
    if (!dbRun) {
      message = await createRunMessage(srcRun, notifyChannel)

      dbRun = new SrcRun({
        runId: srcRun.id,
        submissionTime: new Date(srcRun.submitted!),
        messageId: message.id,
        messageChannelId: message.channelId,
        messageVersion: MESSAGE_VERSION,
        lastStatus: SrcRunStatus.Unknown,
        videoProof: currentVideoProof?.url,
      })
    }

    launchFn(async () => {
      const isOutdatedMessage = dbRun.messageVersion !== MESSAGE_VERSION
      const toEditParts: Partial<RunMessageParts> = isOutdatedMessage ? await getInitialMessage(gameIds, srcRun) : {}
      const editAllParts = isOutdatedMessage || isNewMessage

      const statusChanged = dbRun.lastStatus !== status
      if (editAllParts || statusChanged) {
        logger.trace("Updating run status", srcRun.id, "to", status)
        toEditParts.status = await getStatusText(srcRun)
        toEditParts.color = getRunColor(srcRun)
        dbRun.lastStatus = status
      }
      if (editAllParts || dbRun.videoProof !== currentVideoProof?.url) {
        logger.trace("Updating video proof", srcRun.id)
        toEditParts.videoProof = await fetchVideoText(currentVideoProof)
        dbRun.videoProof = currentVideoProof?.url
      }
      if (editAllParts) {
        const newPlayers = await findNewPlayers(gameIds, srcRun.players.data)
        if (newPlayers.length > 0) {
          toEditParts.firstTimeSubmissionPlayers = newPlayers
        }
      }

      if (!isEmptyObject(toEditParts)) {
        logger.debug("Editing message", srcRun.id)
        message ??= await fetchDiscordMessage(dbRun)
        if (message) {
          await editRunMessage(message, toEditParts)
        }
        dbRun.messageVersion = MESSAGE_VERSION
      } else {
        logger.debug("No changes for run", srcRun.id)
      }

      launch(dbRun.save())
    })
  }

  function createEmbed(parts: Partial<RunMessageParts>, editFrom?: Embed) {
    const builder = editFrom ? EmbedBuilder.from(editFrom) : new EmbedBuilder()
    if (parts.title) builder.setTitle(parts.title)
    if (parts.description) builder.setDescription(parts.description)
    if (parts.thumbnail) builder.setThumbnail(parts.thumbnail)
    if (parts.timestamp) builder.setTimestamp(parts.timestamp)
    if (parts.color) builder.setColor(parts.color)
    builder.setFields(getEmbedFields(parts, editFrom?.fields))
    return builder
  }

  async function createRunMessage(run: RunWithEmbeds, notifyChannel: SendableChannels) {
    logger.info("Creating run message", run.id)

    const parts = await getInitialMessage(gameIds, run)
    return await notifyChannel.send({ embeds: [createEmbed(parts)] })
  }

  async function editRunMessage(message: Message, parts: Partial<RunMessageParts>) {
    await message.edit({
      content: null,
      embeds: [createEmbed(parts, message.embeds[0])],
      flags: "0",
    })
  }
}

interface RunWithMaybeDbRun {
  srcRun: RunWithEmbeds
  dbRun?: SrcRun
}

/**
 * Fetches runs that:
 * - Are newer than the newest run in the database (newly submitted)
 * - Have a "new" status (so old runs that get un-verified are included)
 * - Are already saved in the database (so we might update their status), with a new status
 *
 * Does not mutate the database.
 */
async function getRunsToProcess(gameIds: string[]): Promise<RunWithMaybeDbRun[]> {
  const allDbRuns = await SrcRun.findAll({ order: [["submissionTime", "desc"]] })
  const latestSavedSubmission = allDbRuns[0]?.submissionTime ?? new Date(Date.now() - 60 * 60 * 24 * 1000 * 7)
  const earliestSavedSubmission = allDbRuns[allDbRuns.length - 1]?.submissionTime ?? latestSavedSubmission

  const newStatusRuns = gameIds.map((gameId) =>
    getAllRuns({
      game: gameId,
      status: "new",
      embed: runEmbeds,
      max: 200,
    }),
  )
  const allExistingRuns = gameIds.map((gameId) =>
    getAllRunsSince(earliestSavedSubmission, {
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
  for (const [provider, regex] of Object.entries(videoProviderConfigs)) {
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

async function fetchDiscordMessage(dbRun: SrcRun): Promise<Message | undefined> {
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

function getRunStatus(run: RunWithEmbeds): RunStatus {
  const examinerId = "examiner" in run.status ? run.status.examiner : undefined
  const isSelfVerified =
    run.status.status == "verified" && run.players.data.some((x: Player) => x.rel === "user" && x.id === examinerId)

  if (isSelfVerified) return RunStatus.SelfVerified
  switch (run.status.status) {
    case "new":
      return RunStatus.New
    case "verified":
      return RunStatus.Verified
    case "rejected":
      return RunStatus.Rejected
    default:
      return RunStatus.New
  }
}

function getRunColor(srcRun: RunWithEmbeds) {
  return StatusColor[getRunStatus(srcRun)]
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
  } catch (e) {
    logger.error(e)
    return undefined
  }
}

function launch<T>(promise: Promise<T>) {
  void logErrors(promise)
}

function launchFn<T>(fn: () => Promise<T>) {
  launch(fn())
}

interface GameData {
  game: Game<"variables">
  variablesById: Map<string, Variable>
}

const userCache = new Map<string, Promise<User>>()
const gameCache = new Map<string, Promise<GameData>>()
function clearCaches() {
  userCache.clear()
  gameCache.clear()
}

function getUserCached(userId: string) {
  return getCached(userId, userCache, getUser)
}
function getGameCached(gameId: string) {
  return getCached(gameId, gameCache, async (id) => {
    const game = await getGame(id, { embed: "variables" })
    const variables = new Map(game.variables.data.map((x) => [x.id, x]))
    return { game, variablesById: variables }
  })
}

function getCached<T>(id: string, cache: Map<string, Promise<T>>, getById: (id: string) => Promise<T>): Promise<T> {
  const existing = cache.get(id)
  if (existing) return existing
  const promise = getById(id).catch((e) => {
    container.logger.error(e)
    cache.delete(id)
    throw e
  })
  cache.set(id, promise)
  return promise
}
