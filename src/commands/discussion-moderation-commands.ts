// noinspection JSUnusedGlobalSymbols

import { ApplyOptions } from "@sapphire/decorators"
import { ApplicationCommandRegistry, Command } from "@sapphire/framework"
import { Subcommand } from "@sapphire/plugin-subcommands"
import { ChatInputCommandInteraction, InteractionContextType, MessageFlags, PermissionFlagsBits } from "discord.js"
import { acceptCommand, doReport, logger, unacceptCommand } from "../components/discussion-moderate.js"
import { handleInteractionErrors, userError } from "../components/error-handling.js"
import config from "../config-file.js"
import { DiscussionBan, MessageReport } from "../db/index.js"
import { createLogger } from "../logger.js"

@ApplyOptions<Command.Options>({
  name: "report",
  description: "Report a message (for src-discussion only!!)",
  enabled: !!config.discussionModeration,
})
export class ReportCommand extends Command {
  override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    registry.registerChatInputCommand(
      (builder) =>
        builder
          .setName(this.name)
          .setDescription(this.description)
          .setContexts(InteractionContextType.Guild)
          .addUserOption((option) => option.setName("user").setDescription("User").setRequired(true))
          .addStringOption((option) =>
            option
              .setName("reason")
              .setDescription(
                "Report reason. Please include a message link if appropriate (right-click -> copy message link).",
              )
              .setRequired(true),
          )
          .setDefaultMemberPermissions("0"),
      {
        idHints: config.discussionModeration?.reportIdHint,
      },
    )
  }

  override async chatInputRun(interaction: ChatInputCommandInteraction) {
    return handleInteractionErrors(interaction, logger, async () => {
      if (!interaction.inCachedGuild()) userError("This command can only be used in a server.")
      const user = interaction.options.getUser("user", true)
      const reason = interaction.options.getString("reason", true)
      const member = interaction.member
      await doReport(interaction, member, user, reason)
      await interaction.reply({
        content: `Your report was submitted:\n<@${user.id}>: ${reason}`,
        flags: MessageFlags.Ephemeral,
      })
    })
  }
}

@ApplyOptions<Command.Options>({
  name: "accept",
  description: "Accept the rules and get the discusser role",
  enabled: !!config.discussionModeration,
})
export class AcceptCommand extends Command {
  override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    registry.registerChatInputCommand(
      (builder) =>
        builder.setName(this.name).setDescription(this.description).setContexts(InteractionContextType.Guild),
      {
        idHints: config.discussionModeration?.acceptIdHint,
      },
    )
  }

  override async chatInputRun(interaction: ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      })
    }

    return acceptCommand(interaction, interaction.member)
  }
}

@ApplyOptions<Command.Options>({
  name: "unaccept",
  description: "Remove your discusser role",
  enabled: !!config.discussionModeration,
})
export class UnacceptCommand extends Command {
  override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    registry.registerChatInputCommand(
      (builder) =>
        builder
          .setName(this.name)
          .setDescription(this.description)
          .setContexts(InteractionContextType.Guild)
          .setDefaultMemberPermissions("0"),
      {
        idHints: config.discussionModeration?.unacceptIdHint,
      },
    )
  }

  override async chatInputRun(interaction: ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      })
    }

    return unacceptCommand(interaction, interaction.member)
  }
}

@ApplyOptions<Subcommand.Options>({
  name: "discussion-moderation",
  description: "Admin commands for discussion moderation",
  subcommands: [
    { name: "reports-on", chatInputRun: "chatInputReportsOn" },
    { name: "reports-by", chatInputRun: "chatInputReportsBy" },
    { name: "ban-status", chatInputRun: "chatInputBanStatus" },
    { name: "unban", chatInputRun: "chatInputUnban" },
  ],
  enabled: !!config.discussionModeration,
})
export class DiscussAdminCommand extends Subcommand {
  logger = createLogger("DiscussAdminCommand")

  override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    registry.registerChatInputCommand(
      (builder) =>
        builder
          .setName(this.name)
          .setDescription(this.description)
          .addSubcommand((sub) =>
            sub
              .setName("reports-on")
              .setDescription("List reports on messages authored by a user")
              .addUserOption((opt) =>
                opt.setName("user").setDescription("User to check reports for").setRequired(true),
              ),
          )
          .addSubcommand((sub) =>
            sub
              .setName("reports-by")
              .setDescription("List reports made by a user")
              .addUserOption((opt) =>
                opt.setName("user").setDescription("User to check reports for").setRequired(true),
              ),
          )
          .addSubcommand((sub) =>
            sub
              .setName("ban-status")
              .setDescription("Show ban status of a user")
              .addUserOption((opt) =>
                opt.setName("user").setDescription("User to check ban status for").setRequired(true),
              ),
          )
          .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      {
        idHints: config.discussionModeration?.discussAdminIdHint,
      },
    )
  }

  async chatInputReportsOn(interaction: Subcommand.ChatInputCommandInteraction) {
    return handleInteractionErrors(interaction, this.logger, async () => {
      const user = interaction.options.getUser("user", true)
      const reports = await MessageReport.findAll({
        where: { userId: user.id },
        limit: 15,
        order: [["createdAt", "DESC"]],
      })
      await this.maybeShowReports(interaction, reports, `Reports on <@${user.id}>`)
    })
  }

  async chatInputReportsBy(interaction: Subcommand.ChatInputCommandInteraction) {
    return handleInteractionErrors(interaction, this.logger, async () => {
      const user = interaction.options.getUser("user", true)
      const reports = await MessageReport.findAll({
        where: { reporterId: user.id },
        limit: 15,
        order: [["createdAt", "DESC"]],
      })
      await this.maybeShowReports(interaction, reports, `Reports made by <@${user.id}>`)
    })
  }

  private formatReports(reports: MessageReport[]) {
    return reports.map((r) => {
      const timestamp = `<t:${Math.floor(r.createdAt.getTime() / 1000)}:f>`
      return {
        name: `<@${r.userId}> on ${timestamp}`,
        value: r.reason ?? "No reason provided",
      }
    })
  }
  private maybeShowReports(
    interaction: Subcommand.ChatInputCommandInteraction,
    reports: MessageReport[],
    description: string,
  ) {
    if (reports.length === 0) {
      return interaction.reply({ content: `No reports found.`, flags: MessageFlags.Ephemeral })
    }

    return interaction.reply({
      embeds: [
        {
          title: "Reports",
          description,
          fields: this.formatReports(reports),
        },
      ],
      flags: MessageFlags.Ephemeral,
    })
  }

  async chatInputBanStatus(interaction: Subcommand.ChatInputCommandInteraction) {
    return handleInteractionErrors(interaction, this.logger, async () => {
      const user = interaction.options.getUser("user", true)
      const ban = await DiscussionBan.findOne({ where: { userId: user.id } })
      if (!(ban && new Date() < ban.expiresAt)) {
        return interaction.reply({
          content: `<@${user.id}> is not banned from discussions.`,
          flags: MessageFlags.Ephemeral,
        })
      }
      const expiresAt = `<t:${Math.floor(ban.expiresAt.getTime() / 1000)}:R>`
      const reason = ban.reason ? `Reason: ${ban.reason}` : "No reason provided"
      return interaction.reply({
        content: `<@${user.id}> is banned until ${expiresAt}. ${reason}`,
      })
    })
  }

  async chatInputUnban(interaction: Subcommand.ChatInputCommandInteraction) {
    return handleInteractionErrors(interaction, this.logger, async () => {
      const user = interaction.options.getUser("user", true)
      const ban = await DiscussionBan.findOne({ where: { userId: user.id } })
      if (!ban) {
        return interaction.reply({
          content: `<@${user.id}> is not banned from discussions.`,
          flags: MessageFlags.Ephemeral,
        })
      }
      await ban.destroy()
      return interaction.reply({
        content: `<@${user.id}> has been unbanned from discussions.`,
      })
    })
  }
}
