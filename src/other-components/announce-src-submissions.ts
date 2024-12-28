import { getAllRuns, getGame, Run } from "src-ts"
import { SrcSubmissionProcessing } from "../db/index.js"
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

type EmbedRun = Run<"category,players">

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

function setup(client: Client<true>, config: AnnounceSrcSubmissionsConfig) {
  scheduleJob("processSrcSubmissions", config.cronSchedule, processAllGamesLogging)
    // Run once on startup
    .invoke()

  async function processRuns(gameIdOrName: string) {
    client.logger.info("[AnnounceSrcSubmissions] Processing submissions, id or name:", gameIdOrName)
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

    logger.info(`Processing ${allRuns.length} new runs`)
    for (const run of allRuns) {
      await processRun(run)
    }
    logger.info("All runs processed")

    async function processRun(run: EmbedRun) {
      const playersPrefix = run.players.data.length > 1 ? "Players" : "Player"
      const playerNames = run.players.data
        .map((player) => (player.rel == "user" ? player.names.international : player.name))
        .join(", ")

      const categoryName = Array.isArray(run.category.data) ? "Unknown category" : run.category.data.name

      const runTime = formatDuration(parse(run.times.primary))

      const submissionDate = new Date(run.submitted!)
      const dateSeconds = Math.floor(submissionDate.getTime() / 1000)

      const message = `
New speedrun.com submission!
**Game/Category**: ${gameName} / ${categoryName}
**${playersPrefix}**: ${playerNames}
**Run time**: ${runTime}
**Submission date**: <t:${dateSeconds}:f> (<t:${dateSeconds}:R>)
${run.weblink}
`
      await Promise.all([
        theChannel.send(message),
        SrcSubmissionProcessing.saveLastProcessedTime(gameId, new Date(run.submitted!)),
      ])
      logger.info(`Processed run ${run.id} by ${playerNames}`)
    }
  }

  async function processAllGames() {
    for (const gameId of config.srcGameIds) {
      await processRuns(gameId)
    }
  }

  async function processAllGamesLogging() {
    try {
      await processAllGames()
    } catch (e) {
      client.logger.error("[AnnounceSrcSubmissions] Error processing submissions", e)
    }
  }
}

async function getUnprocessedRuns(gameId: string): Promise<EmbedRun[]> {
  const lastProcessedTimestamp = await SrcSubmissionProcessing.getLastProcessedTime(gameId)
  const runs: EmbedRun[] = await getAllRuns(
    {
      game: gameId,
      orderby: "date",
      direction: "desc",
      status: "new",
      embed: "category,players",
    },
    {
      map: (run) => {
        if (!run.submitted || new Date(run.submitted) <= lastProcessedTimestamp) return undefined
        return run
      },
    },
  )
  return runs.reverse()
}
