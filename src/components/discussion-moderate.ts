import {
  CommandInteraction,
  Guild,
  GuildMember,
  Message,
  MessageFlags,
  SendableChannels,
  TextBasedChannel,
} from "discord.js"
import config from "../config-file.js"
import { createLogger } from "../logger.js"
import { DiscussionTempBan, MessageReport, sequelize } from "../db/index.js"
import { handleInteractionErrors, maybeUserError, UserError } from "./error-handling.js"
import { Op } from "sequelize"

const moderationConfig = config.discussionModeration
const reportConfig = moderationConfig?.reports
const acceptConfig = moderationConfig?.accept

const logger = createLogger("[Discussion]")

function getLogChannel(guild: Guild): (TextBasedChannel & SendableChannels) | undefined {
  if (!moderationConfig) return undefined
  const channel = guild.channels.cache.get(moderationConfig.logChannelId)
  if (!channel || !channel.isTextBased() || !channel.isSendable()) {
    logger.error("Log channel not found or not sendable! Please check configuration")
    return undefined
  }
  return channel
}

function logErrorsToChannel(guild: Guild, promise: Promise<void>): void {
  promise.catch((err) => {
    logger.error("Unhandled error:", err)
    void getLogChannel(guild)?.send("Unhandled error in report moderation! Please check the logs.")
  })
}

function logBoth(guild: Guild, message: string) {
  logger.info(message)
  void getLogChannel(guild)
    ?.send({ content: message, allowedMentions: { parse: [] } })
    .catch((err) => logger.error("Failed to send log message:", err))
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
        flags: MessageFlags.Ephemeral,
      }),
  )
}

async function doReport(reporter: GuildMember, reportedMessage: Message, reason: string | undefined) {
  maybeUserError(await checkCanReport(reporter, reportedMessage))

  const { totalMessageReports } = await sequelize.transaction(() => createDbReport(reporter, reportedMessage, reason))
  handleReportNonInteractive(reporter, reportedMessage, reason, totalMessageReports)
}

function logReport(reportedMessage: Message, reporter: GuildMember, reason: string | undefined) {
  logBoth(
    reportedMessage.guild!,
    `${reportedMessage.url} (by <@${reportedMessage.author.id}>) was reported by <@${reporter.id}>: ${reason || "No reason provided"}`,
  )
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

export async function acceptCommand(interaction: CommandInteraction, member: GuildMember) {
  return handleInteractionErrors(
    interaction,
    logger,
    async () => doAccept(interaction, member),
    () =>
      interaction.reply({
        content: `You have been granted the <@&${acceptConfig!.grantRoleId}> role!`,
        flags: MessageFlags.Ephemeral,
      }),
  )
}

async function getCurrentTempBan(member: GuildMember): Promise<DiscussionTempBan | null> {
  return await DiscussionTempBan.findOne({
    where: {
      userId: member.id,
      guildId: member.guild.id,
    },
  })
}

async function doAccept(interaction: CommandInteraction, member: GuildMember): Promise<void> {
  maybeUserError(await checkCanAccept(interaction, member))
  await member.roles.add(acceptConfig!.grantRoleId)
  logAccept(member)
}

function logAccept(member: GuildMember) {
  logBoth(member.guild, `<@${member.id}> accepted the rules and was granted the <@&${acceptConfig!.grantRoleId}> role.`)
}

function getBannedMessage(expiresAt: Date): string {
  return (
    `You have been temporarily banned from discussion for ${moderationConfig!.tempBanDays} days. ` +
    `You may re-join discussion by re-running /accept <t:${Math.floor(expiresAt.getTime() / 1000)}:R>. ` +
    `To appeal this ban, please open a src-admin-ticket.`
  )
}

async function checkCanAccept(interaction: CommandInteraction, member: GuildMember): Promise<string | undefined> {
  if (!acceptConfig) return "This feature is currently disabled."

  if (member.roles.cache.has(acceptConfig.grantRoleId)) {
    return `You already have the <@&${acceptConfig.grantRoleId}> role!`
  }

  const ban = await getCurrentTempBan(member)
  if (ban && ban.expiresAt > new Date()) {
    throw new UserError(getBannedMessage(ban.expiresAt))
  }

  if (acceptConfig.requiredChannel && interaction.channelId !== acceptConfig.requiredChannel) {
    return `You must run this command in <#${acceptConfig.requiredChannel}>.`
  }

  if (acceptConfig.requiredRoles) {
    const hasRequiredRole = acceptConfig.requiredRoles.some((roleId) => member.roles.cache.has(roleId))
    if (!hasRequiredRole) {
      return (
        "You do not have one of the required roles: " +
        acceptConfig.requiredRoles.map((roleId) => `<@&${roleId}>`).join(", ")
      )
    }
  }

  return
}

function handleReportNonInteractive(
  reporter: GuildMember,
  reportedMessage: Message,
  reportReason: string | undefined,
  totalMessageReports: number,
) {
  const guild = reporter.guild
  logReport(reportedMessage, reporter, reportReason)
  if (totalMessageReports == reportConfig!.reportThreshold) {
    logErrorsToChannel(guild, createTempBan(reportedMessage))
    logErrorsToChannel(guild, logTempBan(reportedMessage))
  }
}

async function createTempBan(reportedMessage: Message) {
  const author = reportedMessage.member
  if (!author) return
  const guild = reportedMessage.guild!
  const discusserRoleId = acceptConfig!.grantRoleId
  const tempBanDays = moderationConfig!.tempBanDays
  const now = new Date()
  const expiresAt = new Date(now.getTime() + tempBanDays * 24 * 60 * 60 * 1000)
  let ban = await getCurrentTempBan(author)
  const banReason = `Message ${reportedMessage.id} reported ${reportConfig!.reportThreshold} times`
  if (ban && ban.expiresAt > now) {
    // Renew ban
    ban.expiresAt = ban.expiresAt > expiresAt ? ban.expiresAt : expiresAt
    ban.bannedAt = now
    ban.reason = banReason
  } else {
    // New ban
    ban = new DiscussionTempBan({
      userId: author.id,
      guildId: guild.id,
      bannedAt: now,
      expiresAt,
      reason: banReason,
    })
  }
  await ban.save()

  if (discusserRoleId && author.roles.cache.has(discusserRoleId)) {
    await author.roles.remove(discusserRoleId, "Temp ban due to message reports")
  }
  await author.send(getBannedMessage(expiresAt))
}

async function logTempBan(reportedMessage: Message) {
  const totalMessageReports = reportConfig!.reportThreshold
  const reporters = await MessageReport.findAll({ where: { messageId: reportedMessage.id } })
  logger.info(
    `Temp banning <@${reportedMessage.author.id}> for ${totalMessageReports} message reports on ${reportedMessage.url}.`,
  )
  await getLogChannel(reportedMessage.guild!)?.send({
    content: (reportConfig!.banNotifyRoles ?? []).map((roleId) => `<@&${roleId}>`).join(" "),
    embeds: [
      {
        title: `Temp ban!`,
        description: `${reportedMessage.url} (by <@${reportedMessage.author.id}>) was reported ${totalMessageReports} times:`,
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
