import {
  CommandInteraction,
  Guild,
  GuildMember,
  Message,
  MessageFlags,
  SendableChannels,
  Snowflake,
  TextBasedChannel,
} from "discord.js"
import config from "../config-file.js"
import { createLogger } from "../logger.js"
import { DiscussionTempBan, MessageReport, sequelize } from "../db/index.js"
import { handleInteractionErrors, maybeUserError, UserError } from "./error-handling.js"

const moderationConfig = config.discussionModeration
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

const dev = process.env.NODE_ENV === "development"
async function checkCanReport(reporter: GuildMember, reportedMessage: Message): Promise<string | undefined> {
  if (!moderationConfig) {
    return "Reporting is currently disabled."
  }
  if (moderationConfig.reportableChannels && !moderationConfig.reportableChannels.includes(reportedMessage.channelId)) {
    return "You cannot report messages in this channel."
  }
  if (!dev && reportedMessage.author.id === reporter.id) {
    return "You cannot report your own messages."
  }
  if (reportedMessage.author.bot) {
    return "You cannot report bot messages."
  }

  const m = checkHasRequiredRoles(reporter, moderationConfig.reportRequiredRoles)
  if (m) return m

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
    () => doAccept(interaction, member),
    () =>
      interaction.reply({
        content: `You have been granted the <@&${moderationConfig!.grantRoleId}> role!`,
        flags: MessageFlags.Ephemeral,
      }),
  )
}

export async function unacceptCommand(interaction: CommandInteraction, member: GuildMember) {
  return handleInteractionErrors(
    interaction,
    logger,
    () => doUnaccept(member),
    () =>
      interaction.reply({
        content: `You have been removed from the <@&${moderationConfig!.grantRoleId}> role!`,
        flags: MessageFlags.Ephemeral,
      }),
  )
}

async function doAccept(interaction: CommandInteraction, member: GuildMember): Promise<void> {
  maybeUserError(await checkCanAccept(interaction, member))
  await member.roles.add(moderationConfig!.grantRoleId)
  logAccept(member)
}

function logAccept(member: GuildMember) {
  logBoth(
    member.guild,
    `<@${member.id}> accepted the rules and was granted the <@&${moderationConfig!.grantRoleId}> role.`,
  )
}

async function checkCanAccept(interaction: CommandInteraction, member: GuildMember): Promise<string | undefined> {
  if (!moderationConfig) return "This feature is currently disabled."

  if (member.roles.cache.has(moderationConfig.grantRoleId)) {
    return `You already have the <@&${moderationConfig.grantRoleId}> role!`
  }

  const ban = await getCurrentTempBan(member)
  if (ban && ban.expiresAt > new Date()) {
    throw new UserError(getBannedMessage(ban.expiresAt))
  }

  if (moderationConfig.acceptChannel && interaction.channelId !== moderationConfig.acceptChannel) {
    return `You must run this command in <#${moderationConfig.acceptChannel}>.`
  }

  return checkHasRequiredRoles(member, moderationConfig.acceptRequiredRoles)
}

async function doUnaccept(member: GuildMember): Promise<void> {
  maybeUserError(checkCanUnaccept(member))
  await member.roles.remove(moderationConfig!.grantRoleId)
  logUnaccept(member)
}

function logUnaccept(member: GuildMember) {
  logBoth(member.guild, `<@${member.id}> was removed from the <@&${moderationConfig!.grantRoleId}> role.`)
}

function checkCanUnaccept(member: GuildMember): string | undefined {
  if (!moderationConfig) return "This feature is currently disabled."

  if (!member.roles.cache.has(moderationConfig.grantRoleId)) {
    return `You already don't have the <@&${moderationConfig.grantRoleId}> role!`
  }

  return
}

async function getCurrentTempBan(member: GuildMember): Promise<DiscussionTempBan | null> {
  return await DiscussionTempBan.findOne({
    where: {
      userId: member.id,
      guildId: member.guild.id,
    },
  })
}
function getBannedMessage(expiresAt: Date): string {
  return (
    `You have been temporarily banned from discussion for ${moderationConfig!.tempBanDays} days. ` +
    `You may re-join discussion by re-running /accept <t:${Math.floor(expiresAt.getTime() / 1000)}:R>. ` +
    `To appeal this ban, please open a src-admin-ticket.`
  )
}

function handleReportNonInteractive(
  reporter: GuildMember,
  reportedMessage: Message,
  reportReason: string | undefined,
  totalMessageReports: number,
) {
  const guild = reporter.guild
  logReport(reportedMessage, reporter, reportReason)
  if (totalMessageReports == moderationConfig!.reportsTempBanThreshold) {
    logErrorsToChannel(guild, createTempBan(reportedMessage))
    logErrorsToChannel(guild, logTempBan(reportedMessage))
  }
}

async function createTempBan(reportedMessage: Message) {
  const author = reportedMessage.member
  if (!author) return
  const guild = reportedMessage.guild!
  const discusserRoleId = moderationConfig!.grantRoleId
  const tempBanDays = moderationConfig!.tempBanDays
  const now = new Date()
  const expiresAt = new Date(now.getTime() + tempBanDays * 24 * 60 * 60 * 1000)
  let ban = await getCurrentTempBan(author)
  const banReason = `Message ${reportedMessage.id} reported ${moderationConfig!.reportsTempBanThreshold} times`
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
  const totalMessageReports = moderationConfig!.reportsTempBanThreshold
  const reporters = await MessageReport.findAll({ where: { messageId: reportedMessage.id } })
  logger.info(
    `Temp banning <@${reportedMessage.author.id}> for ${totalMessageReports} message reports on ${reportedMessage.url}.`,
  )
  await getLogChannel(reportedMessage.guild!)?.send({
    content: (moderationConfig!.tempBanNotify ?? []).map((roleId) => `<@&${roleId}>`).join(" "),
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

function checkHasRequiredRoles(member: GuildMember, requiredRoles: Snowflake[] | undefined): string | undefined {
  if (!requiredRoles) return undefined
  const hasRoles = requiredRoles.every((roleId) => member.roles.cache.has(roleId))
  if (!hasRoles) {
    return (
      "You do not have the required roles to use this command: " +
      requiredRoles.map((roleId) => `<@&${roleId}>`).join(", ")
    )
  }
  return undefined
}
