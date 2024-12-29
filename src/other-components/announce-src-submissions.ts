import { Game, getAllRuns, getGame, getUser, Player, PlayerUser, Run, User } from "src-ts"
import { SrcPlayer, SrcRun } from "../db/index.js"
import { Client, Events, lazy, Message, SendableChannels } from "discord.js"
import { AnnounceSrcSubmissionsConfig } from "../config.js"
import { botCanSendInChannel, editLine, formatDuration, getAllRunsSince, statusStrToStatus } from "../utils.js"
import { createLogger } from "../logger.js"
import { scheduleJob } from "node-schedule"
import { parse } from "iso8601-duration"
import { container } from "@sapphire/framework"

const embeds = "players"
type RunWithEmbeds = Run<typeof embeds>

interface PlayerWithDbPlayer {
  dbPlayer: SrcPlayer
  srcPlayer: PlayerUser
}

interface RunWithDbRun {
  dbRun: SrcRun
  srcRun: RunWithEmbeds
  isNew?: boolean
}

export function setUpAnnounceSrcSubmissions(client: Client, config: AnnounceSrcSubmissionsConfig | undefined) {
  if (config) client.once(Events.ClientReady, (readyClient) => setup(readyClient, config))
}

const StatusPrefix = "**Status:** "
const StatusMessage = {
  new: "⏳New",
  verified: "✅ Verified by %p",
  rejected: "❌ Rejected by %p",
}

function setup(client: Client<true>, config: AnnounceSrcSubmissionsConfig) {
  const logger = createLogger("[AnnounceSrcSubmissions]", client.logger)
  scheduleJob("processSrcSubmissions", config.cronSchedule, () => logErrors(run()))
    // Run once on startup
    .invoke()

  async function run() {
    clearCaches()
    const notifyChannel = await client.channels.fetch(config.channelId)
    if (!notifyChannel?.isSendable() || !(await botCanSendInChannel(notifyChannel))) {
      logger.error("Channel not found or not a text channel! Cannot announce submissions.")
      return
    }

    await maybeInitSrcPlayers()

    logger.info("Finding runs")
    let allRuns: RunWithEmbeds[] = []
    for (const gameId of config.srcGameIds) {
      const runs = await getUnprocessedRuns(gameId)
      allRuns.push(...runs.values())
    }
    // ignore runs without a submission time (really ancient runs)
    allRuns = allRuns.filter((run) => run.submitted)

    const allRunIds = allRuns.map((run) => run.id)
    const storedRunMap = new Map((await SrcRun.findAll({ where: { runId: allRunIds } })).map((run) => [run.runId, run]))
    const runsWithStored = allRuns.map((run) => {
      const storedRun =
        storedRunMap.get(run.id) ??
        new SrcRun({
          runId: run.id,
          submissionTime: new Date(run.submitted!),
          lastStatus: statusStrToStatus(run.status.status),
        })
      return { dbRun: storedRun, srcRun: run, isNew: !storedRun }
    })
    runsWithStored.sort((a, b) => a.dbRun.submissionTime.getTime() - b.dbRun.submissionTime.getTime())

    for (const run of runsWithStored) {
      await processRun(run, notifyChannel)
    }
    logger.info("Done")
  }

  async function processRun({ srcRun, dbRun, isNew }: RunWithDbRun, notifyChannel: SendableChannels) {
    logger.info("Processing run:", srcRun.id)

    const status = statusStrToStatus(srcRun.status.status)
    const players = lazy(() => getOrAddPlayers(srcRun))

    const statusChanged = dbRun.lastStatus !== status
    dbRun.lastStatus = status

    let needsSave = isNew || statusChanged
    let message: Message | undefined
    // get or create message
    if (!dbRun.messageChannelId || !dbRun.messageId) {
      message = await createRunMessage(srcRun, dbRun, await players(), notifyChannel)
      needsSave = true
    } else {
      try {
        const channel = await client.channels.fetch(dbRun.messageChannelId)
        message = channel?.isTextBased() ? await channel.messages.fetch(dbRun.messageId) : undefined
      } catch (e) {
        logger.warn("Unable to fetch message for run:", e)
      }

      if (statusChanged) {
        launch(players().then((players) => recordPlayersHavingVerifiedRun(srcRun, players)))
        if (message) launch(updateRunStatusInMessage(message, srcRun))
      }
    }

    if (needsSave) {
      launch(dbRun.save())
    } else {
      logger.info("No changes for run", srcRun.id)
    }
  }

  async function createRunMessage(
    run: RunWithEmbeds,
    storedRun: SrcRun,
    players: PlayerWithDbPlayer[],
    notifyChannel: SendableChannels,
  ) {
    logger.info("Creating message for run", run.id)
    const newPlayers = players.filter((x) => !x.dbPlayer.hasVerifiedRun)
    const newPlayerMessage =
      newPlayers.length > 0
        ? `🎉 **First time submission for:** ${newPlayers.map((x) => x.srcPlayer.names.international).join(", ")}\n`
        : ""

    const playersPrefix = run.players.data.length > 1 ? "Players" : "Player"
    const playerNames = run.players.data
      .map((player) => (player.rel == "user" ? player.names.international : `(Guest) ${player.name}`))
      .join(", ")

    const game = await getGameCached(run.game)
    const category = game.categories.data.find((x) => x.id === run.category)

    const categoryName = category?.name ?? "Unknown category"
    const gameName = game.names.international

    const runTime = formatDuration(parse(run.times.primary))

    const submissionDate = new Date(run.submitted!)
    const dateSeconds = Math.floor(submissionDate.getTime() / 1000)

    const statusText = await getStatusText(run)

    const messageContent = `
## New submission to ${gameName} / ${categoryName}
${newPlayerMessage}
**${playersPrefix}**: ${playerNames}
**Time**: ${runTime}
**Submitted**: <t:${dateSeconds}:f> (<t:${dateSeconds}:R>)
${StatusPrefix}${statusText}
${run.weblink}
`
    const message = await notifyChannel.send(messageContent)

    storedRun.messageId = message.id
    storedRun.messageChannelId = message.channelId

    return message
  }

  async function getStatusText(run: RunWithEmbeds) {
    const examinerName = "examiner" in run.status ? (await getUserCached(run.status.examiner)).names.international : ""
    const status = StatusMessage[run.status.status]
    if (!status) return ""
    return status.replace("%p", examinerName)
  }

  async function updateRunStatusInMessage(message: Message | undefined, run: RunWithEmbeds) {
    if (!message) return
    const newContent = editLine(message.content, StatusPrefix, await getStatusText(run))
    if (message.content != newContent) {
      await message.edit(newContent)
    }
  }

  async function recordPlayersHavingVerifiedRun(run: RunWithEmbeds, players: PlayerWithDbPlayer[]) {
    if (run.status.status === "verified") {
      await Promise.all(
        players.map(async ({ dbPlayer }) => {
          dbPlayer.hasVerifiedRun = true
          return dbPlayer.save()
        }),
      )
    }
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

  async function maybeInitSrcPlayers() {
    if (await SrcPlayer.count()) return
    logger.info(`Initializing table ${SrcPlayer.tableName}`)
    const players = new Set<string>()
    const hasVerifiedRuns = new Set<string>()
    for (const gameId of config.srcGameIds) {
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
}

async function getUnprocessedRuns(gameId: string): Promise<Map<string, RunWithEmbeds>> {
  const lastSeenSubmitTime = SrcRun.max<Date | null, SrcRun>("submissionTime")

  const newRuns = getAllRuns({
    game: gameId,
    status: "new",
    embed: embeds,
  })

  let lastSeenRunTime = await lastSeenSubmitTime
  if (!lastSeenRunTime) {
    lastSeenRunTime = new Date()
    lastSeenRunTime.setMinutes(lastSeenRunTime.getMinutes() - 24 * 60 * 7 * 2)
  }

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

const gameCache = new Map<string, Promise<Game<"categories">>>()

function getGameCached(gameId: string) {
  let game = gameCache.get(gameId)
  if (!game) {
    game = getGame(gameId, { embed: "categories" }).catch((e) => {
      container.logger.error(e)
      gameCache.delete(gameId)
      throw e
    })
    gameCache.set(gameId, game)
  }
  return game
}

const userCache = new Map<string, Promise<User>>()

function getUserCached(userId: string) {
  let user = userCache.get(userId)
  if (!user) {
    user = getUser(userId).catch((e) => {
      container.logger.error(e)
      userCache.delete(userId)
      throw e
    })
    userCache.set(userId, user)
  }
  return user
}

function clearCaches() {
  gameCache.clear()
  userCache.clear()
}
