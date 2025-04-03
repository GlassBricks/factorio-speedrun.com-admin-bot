import {
  Category,
  Game,
  getAllRuns,
  getGame,
  getLeaderboard,
  getUser,
  Leaderboard,
  Player,
  PlayerUser,
  Run,
  User,
  Variable,
} from "src-ts"
import { SrcPlayer, SrcRun, SrcRunStatus } from "../db/index.js"
import { Client, Events, lazy, Message, MessageFlags, SendableChannels } from "discord.js"
import { AnnounceSrcSubmissionsConfig } from "../config-file.js"
import {
  assertNever,
  botCanSendInChannel,
  editLine,
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
const MESSAGE_VERSION = 8

const runEmbeds = "players"
type RunWithEmbeds = Run<typeof runEmbeds>

interface PlayerWithDbPlayer {
  dbPlayer: SrcPlayer
  srcPlayer: PlayerUser
}

interface RunWithDbRun {
  dbRun: SrcRun
  srcRun: RunWithEmbeds
}

const SubmittedPrefix = "**Submitted:** "

type TwitchVideoType = "archive" | "highlight" | "upload" | "offline" | "unknown"

interface TwitchVideoInfo {
  type: "twitch"
  url: string
  twitchVideoType: TwitchVideoType
}

interface YoutubeVideoInfo {
  type: "youtube"
  url: string
}

const VideoPrefix = "**Video proof:** "
const TwitchVideoMessage = {
  archive: "Found [Twitch VOD](%url) (not a permanent video!!)",
  highlight: "Found [Twitch highlight](%url)",
  upload: "Found [uploaded Twitch video](%url)",
  offline: "Found [offline Twitch video](%url) (Twitch returned 404)",
  unknown: "Found [Twitch video](%url), status unknown. (Fix me @GlassBricks !)",
}

const StatusPrefix = "**Status:** "
const StatusMessage = {
  new: "⏳ new",
  verified: "verified by %p",
  rejected: "❌ rejected by %p",
  selfVerified: "auto-verified",
}

const YoutubeVideoMessage = "Found [YouTube video](%url)"
const NoVideoMessage = "None found"

// hardcoded for now
function isChallengerRun(_run: RunWithEmbeds, category: Category | undefined, place: number) {
  if (category?.name.toLowerCase().includes("category extensions")) {
    return place <= 3
  }
  return place <= 5
}

function findPlaceInLeaderboard(leaderboard: Leaderboard<"category">, run: RunWithEmbeds) {
  // find first run with slower time; this run replaces it
  const index = leaderboard.runs.findIndex((x) => x.run.times.primary_t > run.times.primary_t || x.run.id === run.id)
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
async function getMessageContent(
  run: RunWithEmbeds,
  players: PlayerWithDbPlayer[],
  config: AnnounceSrcSubmissionsConfig,
) {
  const gameData = await getGameCached(run.game)
  const game = gameData.game
  const leaderboard = await getActualLeaderboard(gameData, run)
  const category = leaderboard && (Array.isArray(leaderboard.category.data) ? undefined : leaderboard.category.data)

  const newPlayers = players.filter((x) => !x.dbPlayer.hasVerifiedRun)
  const newPlayerMessage =
    newPlayers.length > 0
      ? `🎉 **First time submission:** ${newPlayers.map((x) => x.srcPlayer.names.international).join(", ")}\n`
      : ""

  const place = leaderboard && findPlaceInLeaderboard(leaderboard, run)
  const placeText =
    place === undefined
      ? "Unknown"
      : place === 1
        ? "🥇 A New World Record"
        : place === 2
          ? "🥈"
          : place === 3
            ? "🥉"
            : formatPlace(place)

  const isChallenger = category && place && isChallengerRun(run, category, place)
  const challengerMessage = isChallenger ? `**🏆 Challenger run:** May be ${placeText}!` : `May be ${placeText}`

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
  const gameName = config.games.find((x) => x.id === game.id)?.nickname ?? game?.names.international ?? "Unknown game"

  const runTime = formatDuration(parse(run.times.primary))

  const submissionDate = new Date(run.submitted!)
  const dateSeconds = Math.floor(submissionDate.getTime() / 1000)

  return `
## ${gameName} | [${categoryName} by ${playerNames} in ${runTime}](${run.weblink})
${newPlayerMessage}${challengerMessage}

${VideoPrefix}(loading...)
${StatusPrefix}(loading...)
${SubmittedPrefix}<t:${dateSeconds}:f> (<t:${dateSeconds}:R>)
`
}
function setup(client: Client<true>, config: AnnounceSrcSubmissionsConfig) {
  scheduleJob("processSrcSubmissions", config.cronSchedule, () => logErrors(run()))
    // Run once on startup
    .invoke()

  async function run() {
    await maybeInitSrcPlayers()
    clearCaches()

    const notifyChannel = await client.channels.fetch(config.channelId)
    if (!notifyChannel?.isSendable() || !(await botCanSendInChannel(notifyChannel))) {
      logger.error("Channel not found or not a text channel! Cannot announce submissions.")
      return
    }

    logger.info("Finding runs")
    const gameIds = config.games.map((x) => x.id)
    const allRuns = await createDbRunsIfNeeded(await getRunsToProcess(gameIds))

    for (const run of allRuns) {
      await processRun(run, notifyChannel)
    }
    logger.info("Done")
  }

  async function processRun({ srcRun, dbRun }: RunWithDbRun, notifyChannel: SendableChannels) {
    logger.info("Processing run:", srcRun.id)

    const status = statusStrToStatus(srcRun.status.status)
    const players = lazy(() => getOrAddPlayers(srcRun))

    let message: Message | undefined
    const isNewMessage = !dbRun.messageChannelId || !dbRun.messageId
    if (isNewMessage) {
      message = await createRunMessage(srcRun, dbRun, await players(), notifyChannel)
    }
    const shouldRefreshMessageContent =
      !isNewMessage && (dbRun.messageVersion !== MESSAGE_VERSION || status == SrcRunStatus.New)
    const shouldUpdateAllComponents = shouldRefreshMessageContent || isNewMessage

    async function updateMessage() {
      let content: string | undefined
      let messageFetched = false
      async function editContent(fn: (content: string) => Promise<string>) {
        if (!messageFetched) {
          message ??= await fetchMessage(dbRun)
          messageFetched = true
        }
        if (!message) return
        if (!content) {
          if (shouldRefreshMessageContent) {
            content = await getMessageContent(srcRun, await players(), config)
          } else {
            content = message.content
          }
        }
        content = await fn(content)
        logger.debug("New content:", content)
      }

      const shouldUpdateStatus = shouldUpdateAllComponents || dbRun.lastStatus !== status
      if (shouldUpdateStatus) {
        logger.info("Updating status", srcRun.id)
        await editContent(updateRunStatusInMessage.bind(undefined, srcRun))
        dbRun.lastStatus = status
      }
      const shouldUpdateVideo = shouldUpdateAllComponents || srcRun.status.status === "new"
      if (shouldUpdateVideo) {
        logger.info("Updating video", srcRun.id)
        await editContent(updateVideoProofInMessage.bind(undefined, srcRun))
      }
      if (
        message &&
        content &&
        (message.content !== content || shouldUpdateAllComponents || shouldRefreshMessageContent)
      ) {
        logger.info("Editing message", srcRun.id)
        await message.edit({ content, flags: MessageFlags.SuppressEmbeds })
        dbRun.messageVersion = MESSAGE_VERSION
      } else {
        logger.info("No changes for run", srcRun.id)
      }
      launch(dbRun.save())
      if (shouldUpdateStatus && srcRun.status.status === "verified") {
        await recordPlayersHaveVerifiedRun(srcRun, await players(), message)
      }
    }

    launch(updateMessage())
  }

  async function createRunMessage(
    run: RunWithEmbeds,
    dbRun: SrcRun,
    players: PlayerWithDbPlayer[],
    notifyChannel: SendableChannels,
  ) {
    logger.info("Creating message for run", run.id)
    const messageContent = await getMessageContent(run, players, config)
    const message = await notifyChannel.send({
      content: messageContent,
      flags: MessageFlags.SuppressEmbeds,
    })

    dbRun.messageId = message.id
    dbRun.messageChannelId = message.channelId
    dbRun.messageVersion = MESSAGE_VERSION

    return message
  }

  async function recordPlayersHaveVerifiedRun(
    run: RunWithEmbeds,
    players: PlayerWithDbPlayer[],
    message: Message | undefined,
  ) {
    if (run.status.status !== "verified") return
    const newPlayers = players.filter((x) => !x.dbPlayer.hasVerifiedRun)
    if (newPlayers.length === 0) return
    await Promise.all(
      newPlayers.map(({ dbPlayer }) => {
        dbPlayer.hasVerifiedRun = true
        return dbPlayer.save()
      }),
    )

    if (config.announceNewPlayersMessage && message) {
      try {
        const playerNames = newPlayers.map((x) => x.srcPlayer.names.international).join(", ")
        const messageContent = config.announceNewPlayersMessage.replace("%p", playerNames)
        await message.reply(messageContent)
      } catch (e) {
        logger.error(e)
      }
    }
  }

  async function maybeInitSrcPlayers() {
    if (await SrcPlayer.count()) return
    if (process.env.NODE_ENV === "development") return
    logger.info(`Initializing table ${SrcPlayer.tableName}`)
    const players = new Set<string>()
    const hasVerifiedRuns = new Set<string>()
    for (const { id: gameId } of config.games) {
      const runs = await getAllRuns({ game: gameId, max: 200 })
      for (const run of runs) {
        const verified = run.status.status === "verified"
        for (const player of run.players) {
          if (player.rel === "user") {
            players.add(player.id)
            if (verified) hasVerifiedRuns.add(player.id)
          }
        }
      }
    }
    logger.info(`Found ${players.size} users`)
    await SrcPlayer.bulkCreate(
      Array.from(players).map((id) => ({
        userId: id,
        hasVerifiedRun: hasVerifiedRuns.has(id),
      })),
    )
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
  const latestSavedSubmission = allDbRuns[0]?.submissionTime ?? new Date(Date.now() - 60 * 60 * 24 * 1000)
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
    if (!run.submitted) continue // ignore very old runs without submission time for now
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

async function createDbRunsIfNeeded(runs: RunWithMaybeDbRun[]): Promise<RunWithDbRun[]> {
  const runsNeedingDbRun = runs.filter((x) => !x.dbRun)
  if (runsNeedingDbRun.length === 0) return runs as RunWithDbRun[]
  const dbRuns = await SrcRun.bulkCreate(
    runsNeedingDbRun.map((x) => ({
      runId: x.srcRun.id,
      submissionTime: new Date(x.srcRun.submitted!),
      lastStatus: statusStrToStatus(x.srcRun.status.status),
    })),
  )
  const dbRunMap = new Map(dbRuns.map((x) => [x.runId, x]))
  return runs.map((x) => ({ srcRun: x.srcRun, dbRun: x.dbRun ?? dbRunMap.get(x.srcRun.id)! }))
}

function findLinkMatching(run: RunWithEmbeds, regex: RegExp) {
  const videoLinks = run.videos?.links
  if (!videoLinks) return undefined
  for (const link of videoLinks) {
    const match = link.uri.match(regex)
    if (match) {
      return match[1]
    }
  }
  return undefined
}
const twitchVideoProofRegex = /^(?:https?:\/\/)?(?:www\.)?twitch\.tv\/videos\/(\d+)/
async function findTwitchVideo(run: RunWithEmbeds): Promise<TwitchVideoInfo | undefined> {
  const videoId = findLinkMatching(run, twitchVideoProofRegex)
  if (!videoId) return undefined
  const video = await twitchClient
    .getVideo(videoId)
    .then((video) => video?.type ?? "offline")
    .catch((e) => {
      logger.error("Error fetching twitch video", e)
      return "unknown" as const
    })
  return {
    type: "twitch",
    url: `https://www.twitch.tv/videos/${videoId}`,
    twitchVideoType: video,
  }
}

const youtubeVideoProofRegex = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
// eslint-disable-next-line @typescript-eslint/require-await
async function findYoutubeVideo(run: RunWithEmbeds): Promise<YoutubeVideoInfo | undefined> {
  const videoId = findLinkMatching(run, youtubeVideoProofRegex)
  if (!videoId) return undefined
  return {
    type: "youtube",
    url: `https://www.youtube.com/watch?v=${videoId}`,
  }
}

async function findVideo(run: RunWithEmbeds): Promise<TwitchVideoInfo | YoutubeVideoInfo | undefined> {
  return (await findTwitchVideo(run)) ?? (await findYoutubeVideo(run))
}

async function fetchMessage(dbRun: SrcRun): Promise<Message | undefined> {
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

async function getStatusText(run: RunWithEmbeds) {
  const examinerId = "examiner" in run.status ? run.status.examiner : undefined
  const isSelfVerified =
    run.status.status == "verified" && run.players.data.some((x: Player) => x.rel === "user" && x.id === examinerId)

  const status = isSelfVerified ? "selfVerified" : run.status.status
  const statusMessage = StatusMessage[status] ?? "Unknown"
  if (statusMessage.includes("%p")) {
    const examinerName = "examiner" in run.status ? (await getUserCached(run.status.examiner)).names.international : ""
    return statusMessage.replace("%p", examinerName)
  }
  return statusMessage
}

async function updateRunStatusInMessage(run: RunWithEmbeds, content: string): Promise<string> {
  return editLine(content, StatusPrefix, await getStatusText(run))
}

async function getVideoProofText(run: RunWithEmbeds) {
  const video = await findVideo(run)
  if (!video) return NoVideoMessage
  if (video.type === "twitch") {
    return TwitchVideoMessage[video.twitchVideoType].replace("%url", video.url)
  } else if (video.type === "youtube") {
    return YoutubeVideoMessage.replace("%url", video.url)
  } else {
    assertNever(video)
  }
}

async function updateVideoProofInMessage(run: RunWithEmbeds, content: string): Promise<string> {
  return editLine(content, VideoPrefix, await getVideoProofText(run), SubmittedPrefix)
}

async function getOrAddPlayers(run: RunWithEmbeds): Promise<PlayerWithDbPlayer[]> {
  const playerUser: PlayerUser[] = run.players.data.filter((x): x is Player & { rel: "user" } => x.rel === "user")
  const players = await SrcPlayer.findAll({ where: { userId: playerUser.map((x) => x.id) } })
  const newPlayerUsers = playerUser.filter((x) => !players.some((p) => p.userId === x.id))
  if (newPlayerUsers.length > 0) {
    const newPlayers = await SrcPlayer.bulkCreate(
      newPlayerUsers.map((x) => ({
        userId: x.id,
        hasVerifiedRun: false,
      })),
      { returning: true },
    )
    players.push(...newPlayers)
  }
  return players.map((player) => ({
    dbPlayer: player,
    srcPlayer: playerUser.find((x) => x.id === player.userId)!,
  }))
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
