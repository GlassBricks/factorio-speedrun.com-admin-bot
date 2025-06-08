import {
  CommandInteraction,
  Guild,
  GuildMember,
  Message,
  MessageFlags,
  PermissionFlagsBits,
  SendableChannels,
  Snowflake,
  TextBasedChannel,
  User,
} from "discord.js"
import config from "../config-file.js"
import { createLogger } from "../logger.js"
import { DiscussionBan, MessageReport, sequelize } from "../db/index.js"
import { handleInteractionErrors, maybeUserError, userError } from "./error-handling.js"
import * as crypto from "node:crypto"
import { GuildChannel } from "discord.js"

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
  reportedUser: User | null,
  reason?: string,
) {
  return handleInteractionErrors(
    interaction,
    logger,
    () => doReport(reporter, reportedMessage, reportedUser, reason),
    () =>
      interaction.reply({
        content: "Your report was submitted:\n" + ` ${reportedMessage.url}: ${reason || "No reason provided"}`,
        flags: MessageFlags.Ephemeral,
      }),
  )
}

async function doReport(
  reporter: GuildMember,
  reportedMessage: Message,
  reportedUser: User | null,
  reason: string | undefined,
) {
  if (reportedUser !== null && reportedUser.id !== reportedMessage.author.id) {
    if (!reason) {
      userError("A reason must be provided, if reporting someone different than the author of the message.")
    }
  }
  reportedUser ??= reportedMessage.author
  maybeUserError(await checkCanReport(reporter, reportedMessage, reportedUser))
  const guild = reporter.guild
  let reportedMember: GuildMember
  try {
    reportedMember = await guild.members.fetch(reportedUser)
  } catch {
    userError("Reported user is not in this server.")
  }

  const { totalMessageReports } = await sequelize.transaction(() =>
    createDbReport(reporter, reportedMessage, reportedMember, reason),
  )
  handleReportNonInteractive(reporter, reportedMessage, reportedMember, reason, totalMessageReports)
}

/**
 * A simple hash function for IDs, to pseudo-anonymize them in logs.
 */
function hashId(id: string): string {
  const salt = "apples > bananas"
  const hash = crypto.createHash("sha256")
  hash.update(id)
  hash.update(salt)
  return hash.digest("hex")
}

function logReport(
  reportedMessage: Message,
  reporter: GuildMember,
  reportedMember: GuildMember,
  reason: string | undefined,
) {
  const userHash = hashId(reporter.id).substring(0, 8)
  logBoth(
    reportedMessage.guild!,
    `<@${reportedMember.id}> was reported by ${userHash} (for ${reportedMessage.url}): ${reason || "No reason provided"}`,
  )
}

const dev = process.env.NODE_ENV === "development"
async function checkCanReport(
  reporter: GuildMember,
  reportedMessage: Message,
  reportedUser: User,
): Promise<string | undefined> {
  if (!moderationConfig) {
    return "Reporting is currently disabled."
  }
  checkHasRequiredRoles(reporter, moderationConfig.reportRequiredRoles)
  const channel = reportedMessage.channel
  if (moderationConfig.reportableChannels) {
    const channelId = (channel.isThread() && channel.parentId) || channel.id
    if (!moderationConfig.reportableChannels.includes(channelId)) {
      return "You cannot report messages in this channel."
    }
  }
  if (!dev && reportedUser.id === reporter.id) {
    return "You cannot report yourself."
  }
  if (reportedUser.bot) {
    return "You cannot report bots."
  }
  if (channel instanceof GuildChannel) {
    if (!channel.permissionsFor(reportedUser)?.has(PermissionFlagsBits.ViewChannel)) {
      return `<@${reportedUser.id}> does not have access to this channel.`
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

async function createDbReport(
  reporter: GuildMember,
  reportedMessage: Message,
  reportedMember: GuildMember,
  reason: string | undefined,
) {
  const report = await MessageReport.create({
    messageId: reportedMessage.id,
    reporterId: reporter.id,
    messageUrl: reportedMessage.url,
    authorId: reportedMember.id,
    reason: reason,
  })
  const totalMessageReports = await MessageReport.count({
    where: { messageId: reportedMessage.id, authorId: reportedMember.id },
  })
  return {
    report,
    totalMessageReports,
  }
}

export async function acceptCommand(interaction: CommandInteraction, member: GuildMember, message: string) {
  return handleInteractionErrors(
    interaction,
    logger,
    () => doAccept(interaction, member, message),
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
        content: `Your <@&${moderationConfig!.grantRoleId}> role was removed.`,
        flags: MessageFlags.Ephemeral,
      }),
  )
}

async function doAccept(interaction: CommandInteraction, member: GuildMember, message: string): Promise<void> {
  maybeUserError(await checkCanAccept(member, message))
  await member.roles.add(moderationConfig!.grantRoleId)
  logAccept(member)
}

function logAccept(member: GuildMember) {
  const message = `<@${member.id}> accepted the rules and was granted the <@&${moderationConfig!.grantRoleId}> role.`
  // logBoth( member.guild, message )
  logger.info(message)
}

function normalizeMessage(message: string): string {
  return message // remove punctuation
    .replaceAll(/[.,]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

async function checkCanAccept(member: GuildMember, message: string): Promise<string | undefined> {
  if (!moderationConfig) return "This feature is currently disabled."

  if (member.roles.cache.has(moderationConfig.grantRoleId)) {
    return `You already have the <@&${moderationConfig.grantRoleId}> role!`
  }

  const ban = await getCurrentBan(member)
  if (ban && ban.expiresAt > new Date()) {
    return getBanMessage(ban)
  }

  if (normalizeMessage(message) !== normalizeMessage(moderationConfig.confirmationMessage)) {
    return `You must provide the exact confirmation message shown in <#${moderationConfig.rulesChannel}>`
  }

  checkHasRequiredRoles(member, moderationConfig.acceptRequiredRoles)
  return
}

async function doUnaccept(member: GuildMember): Promise<void> {
  maybeUserError(checkCanUnaccept(member))
  await member.roles.remove(moderationConfig!.grantRoleId)
  logUnaccept(member)
}

function logUnaccept(member: GuildMember) {
  const message = `<@${member.id}> was removed from the <@&${moderationConfig!.grantRoleId}> role.`
  // logBoth( member.guild, message )
  logger.info(message)
}

function checkCanUnaccept(member: GuildMember): string | undefined {
  if (!moderationConfig) return "This feature is currently disabled."

  if (!member.roles.cache.has(moderationConfig.grantRoleId)) {
    return `You already don't have the <@&${moderationConfig.grantRoleId}> role!`
  }

  return
}

async function getCurrentBan(member: GuildMember): Promise<DiscussionBan | null> {
  return await DiscussionBan.findOne({
    where: {
      userId: member.id,
      guildId: member.guild.id,
    },
  })
}

function getBanMessage(ban: DiscussionBan): string {
  const expiresAt = ban.expiresAt
  const expiresAtTimestamp = `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`
  return (
    `You have been temporarily banned from discussion${ban.reason ? ` due to ${ban.reason}` : ""}.\n` +
    `You may re-join discussion by re-running /accept-discussion-rules ${expiresAtTimestamp}`
  )
}

function handleReportNonInteractive(
  reporter: GuildMember,
  reportedMessage: Message,
  reportedMember: GuildMember,
  reportReason: string | undefined,
  totalMessageReports: number,
) {
  const guild = reporter.guild
  logReport(reportedMessage, reporter, reportedMember, reportReason)
  if (totalMessageReports == moderationConfig!.reportsTempBanThreshold) {
    logErrorsToChannel(guild, createTempBanFromMessageReports(reportedMessage, reportedMember))
    logErrorsToChannel(guild, logTempBan(reportedMessage, reportedMember))
  }
}

async function createTempBanFromMessageReports(reportedMessage: Message, reportedMember: GuildMember) {
  const guild = reportedMessage.guild!
  const discusserRoleId = moderationConfig!.grantRoleId
  const tempBanDays = moderationConfig!.tempBanDays
  const now = new Date()
  const expiresAt = new Date(now.getTime() + tempBanDays * 24 * 60 * 60 * 1000)
  let ban = await getCurrentBan(reportedMember)
  const banReason = `multiple reports on ${reportedMessage.url}`
  if (ban && ban.expiresAt > now) {
    // Renew ban
    ban.expiresAt = ban.expiresAt > expiresAt ? ban.expiresAt : expiresAt
    ban.bannedAt = now
    ban.reason = banReason
  } else {
    // New ban
    ban = new DiscussionBan({
      userId: reportedMember.id,
      guildId: guild.id,
      bannedAt: now,
      expiresAt,
      reason: banReason,
    })
  }
  await ban.save()

  if (discusserRoleId && reportedMember.roles.cache.has(discusserRoleId)) {
    await reportedMember.roles.remove(discusserRoleId, "Temp ban due to message reports")
  }
  await reportedMember.send(getBanMessage(ban))
}

async function logTempBan(reportedMessage: Message, reportedMember: GuildMember) {
  const totalMessageReports = moderationConfig!.reportsTempBanThreshold
  const message = `<@${reportedMember.id}> was reported ${totalMessageReports} times for ${reportedMessage.url}`
  const reporters = await MessageReport.findAll({ where: { messageId: reportedMessage.id } })
  logger.info(message)
  await getLogChannel(reportedMessage.guild!)?.send({
    content: (moderationConfig!.tempBanNotify ?? []).map((roleId) => `<@&${roleId}>`).join(" "),
    embeds: [
      {
        title: `Temp ban!`,
        description: message,
        // fields: [
        //   {
        //     name: "Reports",
        //     value: reporters
        //       .map((report) => `<@${report.reporterId}>: ${report.reason || "No reason provided"}`)
        //       .join("\n"),
        //   },
        // ],
        fields: reporters.map((report) => ({
          name: "",
          value: `<@${report.reporterId}>: ${report.reason || "No reason provided"}`,
        })),
      },
    ],
  })
}

function checkHasRequiredRoles(member: GuildMember, requiredRoles: Snowflake[] | undefined) {
  if (!requiredRoles) return
  const hasRoles = requiredRoles.every((roleId) => member.roles.cache.has(roleId))
  if (!hasRoles) {
    userError(
      "You do not have the required roles to use this command: " +
        requiredRoles.map((roleId) => `<@&${roleId}>`).join(", "),
    )
  }
}
