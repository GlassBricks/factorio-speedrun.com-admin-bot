import {
  CommandInteraction,
  Guild,
  GuildMember,
  MessageFlags,
  SendableChannels,
  Snowflake,
  TextBasedChannel,
  User,
} from "discord.js"
import config from "../config-file.js"
import { createLogger } from "../logger.js"
import { DiscussionBan, MessageReport, sequelize } from "../db/index.js"
import { handleInteractionErrors, maybeUserError, UserError, userError } from "./error-handling.js"
import * as crypto from "node:crypto"
import { Op } from "sequelize"

const moderationConfig = config.discussionModeration
export const logger = createLogger("[Discussion]")

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

export async function doReport(interaction: CommandInteraction, reporter: GuildMember, user: User, reason: string) {
  maybeUserError(await checkCanReport(reporter, user))

  let guildMember: GuildMember
  try {
    guildMember = await reporter.guild.members.fetch(user.id)
  } catch {
    throw new UserError("User not found in the server")
  }

  const { userReports } = await sequelize.transaction(() => createDbReport(reporter, user, reason))
  handleReportNonInteractive(reporter.user, guildMember, reason, userReports)
}

/**
 * A simple hash function for IDs, to pseudo-anonymize them in logs.
 */
function hashId(id: string): string {
  const salt = "apples > bananas"
  const hash = crypto.createHash("sha256")
  hash.update(id)
  hash.update(salt)
  return hash.digest("hex").substring(0, 8)
}

async function createDbReport(reporter: GuildMember, user: User, reason: string) {
  const report = await MessageReport.create({
    userId: user.id,
    reporterId: reporter.id,
    reason: reason,
  })
  const sinceTime = Date.now() - moderationConfig!.reportPeriodHours * 60 * 60 * 1000
  const userReports = await MessageReport.findAll({
    where: {
      userId: user.id,
      createdAt: { [Op.gte]: sinceTime },
    },
    limit: moderationConfig!.reportsTempBanThreshold * 2,
  })
  return {
    report,
    userReports,
  }
}

function logReport(reporter: User, guildMember: GuildMember, reason: string) {
  // only report user hash, don't report user ID in logs
  const reporterHash = hashId(reporter.id)
  logBoth(guildMember.guild, `<@${guildMember.id}> was reported by ${reporterHash}: ${reason}`)
}

const dev = process.env.NODE_ENV === "development"
async function checkCanReport(reporter: GuildMember, user: User): Promise<string | undefined> {
  if (!moderationConfig) {
    return "Reporting is currently disabled."
  }
  checkHasRequiredRoles(reporter, moderationConfig.reportRequiredRoles)
  if (!dev && reporter.user.id === user.id) {
    return "You cannot report yourself."
  }
  if (user.bot) {
    return "You cannot report bots."
  }
  const minTime = Date.now() - moderationConfig.reportPeriodHours * 1000 * 60 * 60
  const existingReport = await MessageReport.findOne({
    where: {
      userId: user.id,
      createdAt: { [Op.gte]: minTime },
    },
  })
  if (existingReport) {
    return (
      `You have already reported this user <t:${Math.floor(existingReport.createdAt.getTime() / 1000)}:R>.\n` +
      `You can only report the same user once every ${moderationConfig.reportPeriodHours} hours.`
    )
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
        content: `Your <@&${moderationConfig!.grantRoleId}> role was removed.`,
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
  const message = `<@${member.id}> accepted the rules and was granted the <@&${moderationConfig!.grantRoleId}> role.`
  // logBoth( member.guild, message )
  logger.info(message)
}

async function checkCanAccept(interaction: CommandInteraction, member: GuildMember): Promise<string | undefined> {
  if (!moderationConfig) return "This feature is currently disabled."

  if (member.roles.cache.has(moderationConfig.grantRoleId)) {
    return `You already have the <@&${moderationConfig.grantRoleId}> role!`
  }

  const ban = await getCurrentBan(member.id, member.guild.id)
  if (ban && ban.expiresAt > new Date()) {
    return getBanMessage(ban)
  }

  if (moderationConfig.acceptChannel && interaction.channelId !== moderationConfig.acceptChannel) {
    return `You must run this command in <#${moderationConfig.acceptChannel}>.`
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

async function getCurrentBan(guildId: string, userId: string): Promise<DiscussionBan | null> {
  return await DiscussionBan.findOne({
    where: { userId, guildId },
  })
}

function getBanMessage(ban: DiscussionBan): string {
  const expiresAt = ban.expiresAt
  const expiresAtTimestamp = `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`
  return (
    `You have been temporarily banned from discussion${ban.reason ? ` due to ${ban.reason}` : ""}.\n` +
    `You may re-join discussion by running /accept ${expiresAtTimestamp}`
  )
}

function handleReportNonInteractive(
  reporter: User,
  guildMember: GuildMember,
  reason: string,
  userReports: MessageReport[],
) {
  logReport(reporter, guildMember, reason)
  if (userReports.length == moderationConfig!.reportsTempBanThreshold) {
    const guild = guildMember.guild
    logErrorsToChannel(guild, createTempBan(guildMember))
    logErrorsToChannel(guild, logTempBan(guildMember, userReports))
  }
}

async function createTempBan(guildMember: GuildMember) {
  const guild = guildMember.guild
  const user = guildMember.user
  const discusserRoleId = moderationConfig!.grantRoleId
  const tempBanDays = moderationConfig!.tempBanDays
  const now = new Date()
  const expiresAt = new Date(now.getTime() + tempBanDays * 24 * 60 * 60 * 1000)
  let ban = await getCurrentBan(guild.id, user.id)
  const banReason = `${moderationConfig!.reportsTempBanThreshold} reports on <@${user.id}>`
  if (ban && ban.expiresAt > now) {
    // Renew ban
    ban.expiresAt = ban.expiresAt > expiresAt ? ban.expiresAt : expiresAt
    ban.bannedAt = now
    ban.reason = banReason
  } else {
    // New ban
    ban = new DiscussionBan({
      userId: user.id,
      guildId: guild.id,
      bannedAt: now,
      expiresAt,
      reason: banReason,
    })
  }
  await ban.save()

  if (discusserRoleId && guildMember.roles.cache.has(discusserRoleId)) {
    await guildMember.roles.remove(discusserRoleId, "Temp ban due to message reports")
  }
  await user.send(getBanMessage(ban))
}

async function logTempBan(guildMember: GuildMember, reports: MessageReport[]) {
  const guild = guildMember.guild
  const totalMessageReports = moderationConfig!.reportsTempBanThreshold
  logger.info(`Temp banning <@${guildMember.id}> for ${totalMessageReports} message reports`)
  await getLogChannel(guild)?.send({
    content: (moderationConfig!.tempBanNotify ?? []).map((roleId) => `<@&${roleId}>`).join(" "),
    embeds: [
      {
        title: `Discussion temp ban`,
        description: `<@${guildMember.id}> was reported ${totalMessageReports} times:`,
        fields: [
          {
            name: "Reports",
            value: reports.map((report) => `${hashId(report.reporterId)}: ${report.reason}`).join("\n"),
          },
        ],
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
