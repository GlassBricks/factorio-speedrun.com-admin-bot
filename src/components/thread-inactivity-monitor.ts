import { ChannelType, Client, Events, FetchedThreads, ThreadChannel } from "discord.js"
import { scheduleJob } from "node-schedule"
import { ThreadInactivityMonitorConfig } from "../config-file.js"
import { createLogger } from "../logger.js"

const MAX_ARCHIVED_THREADS = 50

export function setUpThreadInactivityMonitor(client: Client, config: ThreadInactivityMonitorConfig | undefined) {
  if (config) client.once(Events.ClientReady, (readyClient) => setup(readyClient, config))
}

function setup(client: Client<true>, config: ThreadInactivityMonitorConfig) {
  const logger = createLogger("[ThreadInactivityMonitor]")
  const inactivityMs = config.inactivityDays * 24 * 60 * 60 * 1000

  scheduleJob("threadInactivityCheck", config.cronSchedule, doCheckLogging).invoke()

  async function doCheck() {
    logger.info("Checking for inactive threads")
    const channel = await client.channels.fetch(config.channelId)
    if (!channel) {
      logger.error("Configured channel not found")
      return
    }
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildForum) {
      logger.error("Configured channel is not a text or forum channel")
      return
    }

    const now = Date.now()
    let checkedCount = 0
    let remindedCount = 0

    const activeThreads = await channel.threads.fetchActive()
    for (const thread of activeThreads.threads.values()) {
      checkedCount++
      if (await checkAndRemind(thread, now)) remindedCount++
    }

    const archivedThreads = await fetchRecentArchivedThreads(channel.threads)
    for (const thread of archivedThreads) {
      checkedCount++
      if (await checkAndRemind(thread, now)) remindedCount++
    }

    logger.info(`Checked ${checkedCount} threads, sent ${remindedCount} reminders`)
  }

  async function fetchRecentArchivedThreads(threads: {
    fetchArchived: (options?: { limit?: number; before?: string }) => Promise<FetchedThreads>
  }): Promise<ThreadChannel[]> {
    const result: ThreadChannel[] = []
    let before: string | undefined
    const cutoffTime = Date.now() - inactivityMs * 3
    const batchSize = 25

    outer: while (result.length < MAX_ARCHIVED_THREADS) {
      const batch = await threads.fetchArchived({ limit: batchSize, before })
      if (batch.threads.size === 0) break

      // Threads are ordered by archive_timestamp descending (most recent first)
      for (const thread of batch.threads.values()) {
        if (!thread.archivedAt || thread.archivedAt.getTime() < cutoffTime) {
          break outer
        }
        result.push(thread)
      }

      if (batch.threads.size < batchSize) break
      before = batch.threads.lastKey()
    }

    return result
  }

  async function checkAndRemind(thread: ThreadChannel, now: number): Promise<boolean> {
    if (thread.locked) return false

    const lastActivityTime = await getLastActivityTime(thread)
    if (now - lastActivityTime > inactivityMs) {
      await thread.send(config.reminderMessage)
      logger.info(`Sent reminder to thread: ${thread.name}`)
      return true
    }
    return false
  }

  async function doCheckLogging() {
    try {
      await doCheck()
    } catch (error) {
      logger.error("Failed to check thread inactivity:", error)
    }
  }
}

async function getLastActivityTime(thread: ThreadChannel): Promise<number> {
  // lastMessage can be null if not cached, so fetch the most recent message
  const messages = await thread.messages.fetch({ limit: 1 })
  const lastMessage = messages.first()
  if (lastMessage) {
    return lastMessage.createdTimestamp
  }
  // Fallback to thread creation time if no messages
  return thread.createdTimestamp ?? 0
}
