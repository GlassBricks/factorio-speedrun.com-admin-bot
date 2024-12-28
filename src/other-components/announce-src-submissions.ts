import { getAllRuns, getGame, Player, PlayerUser, Run } from "src-ts"
import { SrcPlayer, SrcRun, SrcRunStatus } from "../db/index.js"
import { Client, Events, SendableChannels } from "discord.js"
import { AnnounceSrcSubmissionsConfig } from "../config.js"
import { botCanSendInChannel } from "../utils.js"
import { createLogger } from "../logger.js"
import { scheduleJob } from "node-schedule"
import { Duration, parse } from "iso8601-duration"

export function setUpAnnounceSrcSubmissions(client: Client, config: AnnounceSrcSubmissionsConfig | undefined) {
  if (config)
    client.once(Events.ClientReady, (readyClient) => {
      setup(readyClient, config)
    })
}

type RunWithEmbeds = Run<"category,players">

function setup(client: Client<true>, config: AnnounceSrcSubmissionsConfig) {
  const baseLogger = createLogger("[AnnounceSrcSubmissions]", client.logger)
  scheduleJob("processSrcSubmissions", config.cronSchedule, processAllGamesLogging)
    // Run once on startup
    .invoke()

  async function processAllGamesLogging() {
    try {
      await processAllGames()
    } catch (e) {
      baseLogger.error("Error processing submissions", e)
    }
  }

  async function processAllGames() {
    await maybeInitKnownRunners()
    for (const gameId of config.srcGameIds) {
      await processRuns(gameId)
    }
  }

  async function processRuns(gameIdOrName: string) {
    baseLogger.info("Processing submissions, id or name:", gameIdOrName)
    const game = await getGame(gameIdOrName)
    const gameName = game.names.international
    const gameId = game.id

    const logger = createLogger(`[AnnounceSrcSubmissions] [${gameName}]`)
    const notifyChannel = await client.channels.fetch(config.channelId)
    if (!notifyChannel || !(await botCanSendInChannel(notifyChannel))) {
      logger.error("Channel not found or not a text channel! Cannot announce submissions.")
      return
    }

    logger.info(`Processing submissions`)
    const theChannel = notifyChannel as SendableChannels

    const allRuns = await getUnprocessedRuns(gameId)

    if (allRuns.length === 0) {
      logger.info("No new runs")
      return
    }

    for (const run of allRuns) {
      await processNewRun(run)
    }
    logger.info("All runs processed")

    async function processNewRun(run: RunWithEmbeds) {
      logger.info("Processing run", run.id)
      const players = getPlayers(run)
      const [storedRun, alreadyExists] = await SrcRun.findOrBuild({
        where: { runId: run.id },
        defaults: { runId: run.id, lastStatus: SrcRunStatus.New },
      })
      if (alreadyExists && storedRun.messageId !== undefined) {
        // todo
        return
      }

      const newPlayers = (await players).filter((x) => !x.player.hasVerifiedRun)
      const newPlayersMessage =
        newPlayers.length > 0
          ? `\n**🎉 First time submission for:** ${newPlayers.map((x) => x.srcPlayer.names.international).join(", ")}\n`
          : ""

      const playersPrefix = run.players.data.length > 1 ? "Players" : "Player"
      const playerNames = run.players.data
        .map((player) => (player.rel == "user" ? player.names.international : `(Guest) ${player.name}`))
        .join(", ")

      const categoryName = Array.isArray(run.category.data) ? "Unknown category" : run.category.data.name

      const runTime = formatDuration(parse(run.times.primary))

      const submissionDate = new Date(run.submitted!)
      const dateSeconds = Math.floor(submissionDate.getTime() / 1000)
      const message = `
## New speedrun.com submission!${newPlayersMessage}
**Game/Category**: ${gameName} / ${categoryName}
**${playersPrefix}**: ${playerNames}
**Run time**: ${runTime}
**Place**: ${run.weblink}
**Submission date**: <t:${dateSeconds}:f> (<t:${dateSeconds}:R>)
${run.weblink}
`
      const discordMessage = await theChannel.send(message)

      storedRun.messageId = discordMessage.id
      storedRun.messageChannelId = discordMessage.channelId

      storedRun.save().catch((e) => logger.error(e))

      logger.info(`Processed run ${run.id} by ${playerNames}`)
    }
  }

  async function getPlayers(run: RunWithEmbeds): Promise<{ player: SrcPlayer; srcPlayer: PlayerUser }[]> {
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
      player,
      srcPlayer: playerUser.find((x) => x.id === player.userId)!,
    }))
  }

  async function getUnprocessedRuns(gameId: string): Promise<RunWithEmbeds[]> {
    const runs: RunWithEmbeds[] = await getAllRuns({
      game: gameId,
      orderby: "date",
      direction: "desc",
      status: "new",
      embed: "category,players",
    })
    return runs.reverse()
  }

  async function maybeInitKnownRunners() {
    if (await SrcPlayer.count()) return
    baseLogger.info(`Initializing table ${SrcPlayer.tableName}`)
    const users = new Set<string>()
    const usersWithVerifiedRuns = new Set<string>()
    for (const gameId of config.srcGameIds) {
      const game = await getGame(gameId)
      const runs = await getAllRuns({ game: game.id, max: 200 })
      for (const run of runs) {
        const verified = run.status.status === "verified"
        for (const player of run.players) {
          if (player.rel === "user") {
            users.add(player.id)
            if (verified) usersWithVerifiedRuns.add(player.id)
          }
        }
      }
    }
    baseLogger.info(`Found ${users.size} users`)
    await SrcPlayer.bulkCreate(
      Array.from(users).map((id) => ({
        userId: id,
        hasVerifiedRun: usersWithVerifiedRuns.has(id),
      })),
    )
  }
}

function formatDuration(duration: Duration) {
  let result = ""
  if (duration.years) result += `${duration.years}y`
  if (duration.months) result += `${duration.months}m`
  if (duration.days) result += `${duration.days}d`
  if (duration.hours) result += `${duration.hours}h`
  if (duration.minutes) result += `${duration.minutes}m`
  if (duration.seconds) result += `${duration.seconds}s`
  return result
}
