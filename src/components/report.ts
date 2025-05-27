import { CommandInteraction, GuildMember, Message } from "discord.js"
import config from "../config-file.js"
import { createLogger } from "../logger.js"
import { MessageReport, sequelize } from "../db/index.js"

const reportConfig = config.messageReport

class UserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UserError"
  }
}

const logger = createLogger("[report]")

export async function report(
  interaction: CommandInteraction,
  reporter: GuildMember,
  reportedMessage: Message,
  reason: string | undefined,
) {
  try {
    await doReport(reporter, reportedMessage, reason)
    await interaction.reply({
      content: "Your report was submitted:\n" + ` ${reportedMessage.url}: ${reason || "No reason provided"}`,
      ephemeral: true,
    })
  } catch (error) {
    if (error instanceof UserError) {
      await interaction.reply({
        content: error.message,
        ephemeral: true,
      })
    } else {
      logger.error("Unexpected error in report command:", error)
      await interaction.reply({
        content: "An unexpected error occurred while processing your report! Please report this to the admins/dev.",
        ephemeral: true,
      })
    }
  }
}

async function doReport(reporter: GuildMember, reportedMessage: Message, reason: string | undefined): Promise<void> {
  const message = await verifyCanReport(reporter, reportedMessage)
  if (message) throw new UserError(message)

  const { totalMessageReports } = await sequelize.transaction(() => createReport(reporter, reportedMessage, reason))
  logger.info(
    `Message ${reportedMessage.id} reported by ${reporter.displayName} with reason: ${reason}. Total reports: ${totalMessageReports}`,
  )
  logReportInLogChannel(reportedMessage, reporter, reason, totalMessageReports).catch((error) => {
    logger.error("Failed to log report in log channel!", error)
  })
}

async function logReportInLogChannel(
  reportedMessage: Message,
  reporter: GuildMember,
  reason: string | undefined,
  totalMessageReports: number,
): Promise<void> {
  if (!reportConfig) return
  const logChannel = await reportedMessage.guild!.channels.fetch(reportConfig.logChannelId)
  if (!logChannel) {
    throw new Error("Log channel not found! Please check configuration")
  }
  if (!logChannel.isSendable()) {
    throw new Error("Log channel is not sendable!")
  }

  await logChannel.send({
    content: `${reportedMessage.url} (by <@${reportedMessage.author.id}>) was reported by <@${reporter.id}>: ${reason || "No reason provided"}`,
    allowedMentions: { parse: [] },
  })
  if (totalMessageReports == reportConfig.reportThreshold) {
    const reporters = await MessageReport.findAll({
      where: {
        messageId: reportedMessage.id,
      },
    })
    await logChannel.send({
      content: (reportConfig.reportNotifyRoles ?? []).map((roleId) => `<@&${roleId}>`).join(" "),
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
}

async function createReport(reporter: GuildMember, reportedMessage: Message, reason: string | undefined) {
  const report = await MessageReport.create({
    messageId: reportedMessage.id,
    reporterId: reporter.id,
    reason: reason,
  })
  const totalMessageReports = await MessageReport.count({
    where: {
      messageId: reportedMessage.id,
    },
  })
  return {
    report,
    totalMessageReports,
  }
}

async function verifyCanReport(reporter: GuildMember, reportedMessage: Message): Promise<string | undefined> {
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

  return undefined
}
