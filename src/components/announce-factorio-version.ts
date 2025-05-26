import { Client, EmbedBuilder, Events, HexColorString, MessageCreateOptions, SendableChannels } from "discord.js"
import { scheduleJob } from "node-schedule"
import { AnnounceFactorioVersionConfig } from "../config-file.js"
import { createLogger } from "../logger.js"
import { KnownFactorioVersion, VersionString } from "../db/index.js"

export function setUpAnnounceFactorioVersion(client: Client, config: AnnounceFactorioVersionConfig | undefined) {
  if (config) client.once(Events.ClientReady, (readyClient) => setup(readyClient, config))
}

function setup(client: Client<true>, config: AnnounceFactorioVersionConfig) {
  const logger = createLogger("[AnnounceFactorioVersion]")
  scheduleJob("checkFactorioVersion", config.cronSchedule, doCheckLogging)
    // run once on startup
    .invoke()

  async function getChannel(): Promise<SendableChannels> {
    const channel = await client.channels.fetch(config.channelId)
    if (!channel || !channel.isTextBased() || !channel.isSendable()) {
      throw new Error("Announce channel not found or not text-based!")
    }
    return channel
  }

  async function send(message: string | MessageCreateOptions) {
    const channel = await getChannel()
    return await channel.send(message)
  }

  async function doCheck() {
    logger.info("Checking for new Factorio versions")
    const [currentJson, lastKnownEntry] = await Promise.all([fetchLatestRelease(), KnownFactorioVersion.get()])
    const {
      experimental: { alpha: curExperimental },
      stable: { alpha: curStable },
    } = currentJson

    const current = { stable: curStable, experimental: curExperimental }
    const lastKnownObj = { stable: lastKnownEntry.stable, experimental: lastKnownEntry.experimental }
    let changed = false
    for (const key of ["stable", "experimental"] as const) {
      const oldVersion = lastKnownObj[key]
      const newVersion = current[key]
      if (newVersion !== oldVersion) {
        const oldVersionStr = oldVersion ?? "unknown"
        // purple for stable, bluish for experimental
        const color: HexColorString = key === "stable" ? "#b665d7" : "#43e7ff"
        logger.info(`New ${key} version: ${oldVersionStr} -> ${newVersion}`)
        await send({
          embeds: [
            new EmbedBuilder()
              .setTitle(`New ${key} version`)
              .setDescription(`${oldVersionStr} -> **${newVersion}**`)
              .setColor(color),
          ],
        })
        changed = true
      }
      lastKnownEntry[key] = newVersion
    }
    if (!changed) {
      logger.info("No new versions")
    }
    await lastKnownEntry.save()
  }

  async function doCheckLogging() {
    try {
      await doCheck()
    } catch (error) {
      logger.error("Failed to check Factorio version:", error)
    }
  }
}

const apiEndpoint = "https://factorio.com/api/latest-releases"

interface Versions {
  alpha: VersionString
  demo: VersionString
  expansion: VersionString
  headless: VersionString
}

interface LatestReleaseJson {
  experimental: Versions
  stable: Versions
}

async function fetchLatestRelease(): Promise<LatestReleaseJson> {
  const response = await fetch(apiEndpoint)
  if (!response.ok) {
    throw new Error(`Failed to fetch latest Factorio release: ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as LatestReleaseJson
}
