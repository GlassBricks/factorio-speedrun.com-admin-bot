import { CommandInteraction, Guild, GuildMember, Message, SendableChannels, TextBasedChannel } from "discord.js"
import config from "../config-file.js"
import { createLogger } from "../logger.js"
import { MessageReport, sequelize } from "../db/index.js"
import { handleInteractionErrors, logErrors, maybeUserError } from "./error-handling.js"

const moderationConfig = config.discussionModeration
const reportConfig = moderationConfig?.reports

const logger = createLogger("[report]")

function getLogChannel(guild: Guild): (TextBasedChannel & SendableChannels) | undefined {
  if (!moderationConfig) return undefined
  const channel = guild.channels.cache.get(moderationConfig.logChannelId)
  if (!channel || !channel.isTextBased() || !channel.isSendable()) {
    logger.error("Log channel not found or not sendable! Please check configuration")
    return undefined
  }
  return channel
}

export async function report(
  interaction: CommandInteraction,
  reporter: GuildMember,
  reportedMessage: Message,
  reason: string | undefined,
) {
  return handleInteractionErrors(
    interaction,
    logger,
    () => doReport(reporter, reportedMessage, reason),
    () =>
      interaction.reply({
        content: "Your report was submitted:\n" + ` ${reportedMessage.url}: ${reason || "No reason provided"}`,
        ephemeral: true,
      }),
  )
}

async function doReport(reporter: GuildMember, reportedMessage: Message, reason: string | undefined) {
  maybeUserError(await checkCanReport(reporter, reportedMessage))

  const { totalMessageReports } = await sequelize.transaction(() => createDbReport(reporter, reportedMessage, reason))
  logger.info(
    `Message ${reportedMessage.id} reported by <@${reporter.id}> with reason: ${reason || "No reason provided"}. Total reports: ${totalMessageReports}`,
  )
  logErrors(logger, discordLogReport(reportedMessage, reporter, reason))
  logErrors(logger, checkReportThresholdReached(totalMessageReports, reportedMessage))
}

async function discordLogReport(
  reportedMessage: Message,
  reporter: GuildMember,
  reason: string | undefined,
): Promise<void> {
  await getLogChannel(reportedMessage.guild!)?.send({
    content: `${reportedMessage.url} (by <@${reportedMessage.author.id}>) was reported by <@${reporter.id}>: ${reason || "No reason provided"}`,
    allowedMentions: { parse: [] },
  })
}

async function checkReportThresholdReached(totalMessageReports: number, reportedMessage: Message) {
  if (totalMessageReports == reportConfig!.reportThreshold) {
    await handleReportThresholdReached(reportedMessage, totalMessageReports)
  }
}
async function handleReportThresholdReached(reportedMessage: Message, totalMessageReports: number) {
  const reporters = await MessageReport.findAll({ where: { messageId: reportedMessage.id } })
  await getLogChannel(reportedMessage.guild!)?.send({
    content: (reportConfig!.reportNotifyRoles ?? []).map((roleId) => `<@&${roleId}>`).join(" "),
    embeds: [
      {
        title: `Message report ${totalMessageReports} times!`,
        description: `${reportedMessage.url} (by <@${reportedMessage.author.id}>) was reported:`,
        fields: [
          {
            name: "Reports",
            value: reporters
              .map((report) => `<@${report.reporterId}>: ${report.reason || "No reason provided"}`)
              .join("\n"),
          },
        ],
      },
    ],
  })
}

async function createDbReport(reporter: GuildMember, reportedMessage: Message, reason: string | undefined) {
  const report = await MessageReport.create({
    messageId: reportedMessage.id,
    reporterId: reporter.id,
    reason: reason,
  })
  const totalMessageReports = await MessageReport.count({
    where: { messageId: reportedMessage.id },
  })
  return {
    report,
    totalMessageReports,
  }
}

async function checkCanReport(reporter: GuildMember, reportedMessage: Message): Promise<string | undefined> {
  if (!reportConfig) {
    return "Reporting is currently disabled."
  }
  // if (reportedMessage.author.id === reporter.id) {
  //   return "You cannot report your own messages!"
  // }
  if (reportedMessage.author.bot) {
    return "You cannot report bot messages."
  }
  if (reportConfig.reportableChannels) {
    if (!reportConfig.reportableChannels.includes(reportedMessage.channelId)) {
      return "You cannot report messages in this channel."
    }
  }
  if (reportConfig.requiredRoles) {
    const hasRequiredRole = reportConfig.requiredRoles.some((roleId) => reporter.roles.cache.has(roleId))
    if (!hasRequiredRole) {
      return (
        "You do not have one of the required roles to report messages: " +
        reportConfig.requiredRoles.map((roleId) => `<@&${roleId}>`).join(", ")
      )
    }
  }
  if (reportConfig.forbiddenRoles) {
    const hasForbiddenRole = reportConfig.forbiddenRoles.some((roleId) => reporter.roles.cache.has(roleId))
    if (hasForbiddenRole) {
      return "You have been banned from reporting messages"
    }
  }
  const existingReport = await MessageReport.findOne({
    where: {
      messageId: reportedMessage.id,
      reporterId: reporter.id,
    },
  })
  if (existingReport) {
    return "You have already reported this message with the reason: " + (existingReport.reason || "No reason provided")
  }

  return
}
