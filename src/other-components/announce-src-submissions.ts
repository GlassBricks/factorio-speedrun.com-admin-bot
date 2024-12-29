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
} from "src-ts"
import { SrcPlayer, SrcRun } from "../db/index.js"
import { Client, Events, lazy, Message, SendableChannels } from "discord.js"
import { AnnounceSrcSubmissionsConfig } from "../config.js"
import {
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

export function setUpAnnounceSrcSubmissions(client: Client, config: AnnounceSrcSubmissionsConfig | undefined) {
  if (config) client.once(Events.ClientReady, (readyClient) => setup(readyClient, config))
}

const embeds = "players"
type RunWithEmbeds = Run<typeof embeds>

interface PlayerWithDbPlayer {
  dbPlayer: SrcPlayer
  srcPlayer: PlayerUser
}

interface RunWithDbRun {
  dbRun: SrcRun
  srcRun: RunWithEmbeds
}

const StatusPrefix = "**Status:** "
const StatusMessage = {
  new: "⏳New",
  verified: "✅ Verified by %p",
  rejected: "❌ Rejected by %p",
}

// hardcoded for now
function isChallengerRun(run: RunWithEmbeds, category: Category, place: number) {
  if (category.name.toLowerCase().includes("category extensions")) {
    return place <= 3
  }
  return place <= 5
}

function findPlaceInLeaderboard(leaderboard: Leaderboard, run: RunWithEmbeds) {
  // find first run with slower time; this run replaces it
  const index = leaderboard.runs.findIndex((x) => x.run.times.primary_t > run.times.primary_t)
  if (index === -1) {
    return leaderboard.runs.length + 1
  }
  return index + 1
}

const logger = createLogger("[AnnounceSrcSubmissions]")

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
    const allRuns = (await Promise.all(config.games.map((game) => getUnprocessedRuns(game.id))))
      .flatMap((x) => [...x.values()])
      .filter((run) => run.submitted)

    const storedRuns = new Map(
      (
        await SrcRun.findAll({
          where: { runId: allRuns.map((run) => run.id) },
        })
      ).map((run) => [run.runId, run]),
    )
    const runsWithStored = allRuns.map((run) => {
      const storedRun =
        storedRuns.get(run.id) ??
        new SrcRun({
          runId: run.id,
          submissionTime: new Date(run.submitted!),
          lastStatus: statusStrToStatus(run.status.status),
        })
      return { dbRun: storedRun, srcRun: run }
    })
    runsWithStored.sort((a, b) => a.dbRun.submissionTime.getTime() - b.dbRun.submissionTime.getTime())

    for (const run of runsWithStored) {
      await processRun(run, notifyChannel)
    }
    logger.info("Done")
  }

  async function processRun({ srcRun, dbRun }: RunWithDbRun, notifyChannel: SendableChannels) {
    logger.info("Processing run:", srcRun.id)

    const status = statusStrToStatus(srcRun.status.status)
    const players = lazy(() => getOrAddPlayers(srcRun))

    const statusChanged = dbRun.lastStatus !== status
    dbRun.lastStatus = status

    let message: Message | Promise<Message | undefined> | undefined
    if (!dbRun.messageChannelId || !dbRun.messageId) {
      message = await createRunMessage(srcRun, dbRun, await players(), notifyChannel)
    } else if (statusChanged) {
      // fetch message to update
      message = fetchMessage(dbRun)
    } else {
      // no changes, no need to dbRun.save() either
      logger.info("No changes for run", srcRun.id)
      return
    }

    async function updateMessage() {
      message = await message
      if (message) {
        await updateRunStatusInMessage(message, srcRun)
      }
      if (srcRun.status.status === "verified") {
        await recordPlayersHaveVerifiedRun(srcRun, await players(), message)
      }
    }

    // don't wait to do these things before processing next run
    launch(dbRun.save())
    launch(updateMessage())
  }

  async function createRunMessage(
    run: RunWithEmbeds,
    storedRun: SrcRun,
    players: PlayerWithDbPlayer[],
    notifyChannel: SendableChannels,
  ) {
    logger.info("Creating message for run", run.id)

    const game = await getGameCached(run.game)
    const category = game.categories.data.find((x) => x.id === run.category)

    const leaderboard = await getLeaderboard(run.game, run.category, run.values)

    const newPlayers = players.filter((x) => !x.dbPlayer.hasVerifiedRun)
    const newPlayerMessage =
      newPlayers.length > 0
        ? `🎉 **First time submission:** ${newPlayers.map((x) => x.srcPlayer.names.international).join(", ")}\n`
        : ""

    const place = findPlaceInLeaderboard(leaderboard, run)
    const placeText =
      place == 1 ? "🥇 A New World Record" : place === 2 ? "🥈" : place === 3 ? "🥉" : formatPlace(place)

    const isChallenger = category && isChallengerRun(run, category, place)
    const challengerMessage = isChallenger ? `**🏆 Challenger run:** May be ${placeText}!` : `May be ${placeText}`

    const playerNames =
      run.players.data
        .slice(0, 3)
        .map((player) => (player.rel == "user" ? player.names.international : `(Guest) ${player.name}`))
        .join(", ") + (run.players.data.length > 3 ? `, and ${run.players.data.length - 3} more` : "")

    const categoryName = category?.name ?? "Unknown category"
    const gameName = config.games.find((x) => x.id === run.game)?.nickname ?? game.names.international

    const runTime = formatDuration(parse(run.times.primary))

    const submissionDate = new Date(run.submitted!)
    const dateSeconds = Math.floor(submissionDate.getTime() / 1000)

    const messageContent = `
## ${gameName} / ${categoryName} by ${playerNames} in ${runTime}
${newPlayerMessage}${challengerMessage}

**Submitted**: <t:${dateSeconds}:f> (<t:${dateSeconds}:R>)
${StatusPrefix}
${run.weblink}
`
    const message = await notifyChannel.send(messageContent)

    storedRun.messageId = message.id
    storedRun.messageChannelId = message.channelId

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
        const thread = message.thread ?? (await message.startThread({ name: "New speedrunner!" }))
        const playerNames = newPlayers.map((x) => x.srcPlayer.names.international).join(", ")
        const messageContent = config.announceNewPlayersMessage.replace("%p", playerNames)
        await thread.send(messageContent)
      } catch (e) {
        logger.error(e)
      }
    }
  }

  async function maybeInitSrcPlayers() {
    if (await SrcPlayer.count()) return
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

async function getUnprocessedRuns(gameId: string): Promise<Map<string, RunWithEmbeds>> {
  const lastSeenSubmitTime = SrcRun.max<Date | null, SrcRun>("submissionTime")

  const newRuns = getAllRuns({
    game: gameId,
    status: "new",
    embed: embeds,
  })

  const lastSeenRunTime = (await lastSeenSubmitTime) ?? new Date()

  const runsSinceLastKnown = getAllRunsSince(lastSeenRunTime, {
    game: gameId,
    orderby: "date",
    direction: "desc",
    embed: embeds,
    max: 200,
  })
  const result = new Map<string, RunWithEmbeds>()
  for (const run of await newRuns) {
    result.set(run.id, run)
  }
  for (const run of await runsSinceLastKnown) {
    result.set(run.id, run)
  }
  return result
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

async function updateRunStatusInMessage(message: Message, run: RunWithEmbeds) {
  const newContent = editLine(message.content, StatusPrefix, await getStatusText(run))
  if (message.content != newContent) {
    await message.edit(newContent)
  }
}

async function getStatusText(run: RunWithEmbeds) {
  const examinerName = "examiner" in run.status ? (await getUserCached(run.status.examiner)).names.international : ""
  const status = StatusMessage[run.status.status] ?? "Unknown"
  return status.replace("%p", examinerName)
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

const gameCache = new Map<string, Promise<Game<"categories">>>()
const userCache = new Map<string, Promise<User>>()

function clearCaches() {
  gameCache.clear()
  userCache.clear()
}

function getGameCached(gameId: string) {
  return getCached(gameId, gameCache, (id) => getGame(id, { embed: "categories" }))
}

function getUserCached(userId: string) {
  return getCached(userId, userCache, getUser)
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
