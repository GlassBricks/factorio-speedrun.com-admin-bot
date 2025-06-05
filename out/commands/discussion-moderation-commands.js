// noinspection JSUnusedGlobalSymbols
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Command } from "@sapphire/framework";
import { InteractionContextType, MessageFlags, PermissionFlagsBits, } from "discord.js";
import { acceptCommand, report, unacceptCommand } from "../components/discussion-moderate.js";
import { ApplicationCommandType } from "discord-api-types/v10";
import config from "../config-file.js";
import { getMessageFromLink } from "../utils.js";
import { ApplyOptions } from "@sapphire/decorators";
import { Subcommand } from "@sapphire/plugin-subcommands";
import { createLogger } from "../logger.js";
import { handleInteractionErrors } from "../components/error-handling.js";
import { DiscussionBan, MessageReport } from "../db/index.js";
let ReportCommand = class ReportCommand extends Command {
    registerApplicationCommands(registry) {
        registry.registerChatInputCommand((builder) => builder
            .setName(this.name)
            .setDescription(this.description)
            .setContexts(InteractionContextType.Guild)
            .addStringOption((option) => option
            .setName("message-link")
            .setDescription('Message to report (right click -> "Copy message link" -> paste here)')
            .setRequired(true))
            .addStringOption((option) => option.setName("reason").setDescription("Report reason"))
            .setDefaultMemberPermissions("0"), {
            idHints: config.discussionModeration?.reportIdHint,
        });
        registry.registerContextMenuCommand((builder) => builder
            .setName("Report Message")
            .setContexts(InteractionContextType.Guild)
            .setType(ApplicationCommandType.Message)
            .setDefaultMemberPermissions("0"), {
            idHints: config.discussionModeration?.reportContextMenuIdHint,
        });
    }
    async chatInputRun(interaction) {
        const messageLink = interaction.options.getString("message-link", true);
        const message = await getMessageFromLink(interaction.client, messageLink).catch((err) => {
            interaction.client.logger.error("Failed to fetch message from link:", err);
            return undefined;
        });
        if (!message) {
            return interaction.reply({
                content: "Could not find the provided message! Please check the link, or contact the admins/devs if you think this is a bug.",
                flags: MessageFlags.Ephemeral,
            });
        }
        if (!interaction.inCachedGuild()) {
            return interaction.reply({
                content: "This command can only be used in a server.",
                flags: MessageFlags.Ephemeral,
            });
        }
        return report(interaction, interaction.member, message, interaction.options.getString("reason") ?? undefined);
    }
    async contextMenuRun(interaction) {
        if (!interaction.inCachedGuild() || !interaction.isMessageContextMenuCommand()) {
            return interaction.reply({
                content: "This command can only be used in a server.",
                flags: MessageFlags.Ephemeral,
            });
        }
        const message = interaction.targetMessage;
        return report(interaction, interaction.member, message, undefined);
    }
};
ReportCommand = __decorate([
    ApplyOptions({
        name: "report",
        description: "Report a message",
        enabled: !!config.discussionModeration,
    })
], ReportCommand);
export { ReportCommand };
let AcceptCommand = class AcceptCommand extends Command {
    registerApplicationCommands(registry) {
        registry.registerChatInputCommand((builder) => builder.setName(this.name).setDescription(this.description).setContexts(InteractionContextType.Guild), {
            idHints: config.discussionModeration?.acceptIdHint,
        });
    }
    async chatInputRun(interaction) {
        if (!interaction.inCachedGuild()) {
            return interaction.reply({
                content: "This command can only be used in a server.",
                flags: MessageFlags.Ephemeral,
            });
        }
        return acceptCommand(interaction, interaction.member);
    }
};
AcceptCommand = __decorate([
    ApplyOptions({
        name: "accept",
        description: "Accept the rules and get the discusser role",
        enabled: !!config.discussionModeration,
    })
], AcceptCommand);
export { AcceptCommand };
let UnacceptCommand = class UnacceptCommand extends Command {
    registerApplicationCommands(registry) {
        registry.registerChatInputCommand((builder) => builder
            .setName(this.name)
            .setDescription(this.description)
            .setContexts(InteractionContextType.Guild)
            .setDefaultMemberPermissions("0"), {
            idHints: config.discussionModeration?.unacceptIdHint,
        });
    }
    async chatInputRun(interaction) {
        if (!interaction.inCachedGuild()) {
            return interaction.reply({
                content: "This command can only be used in a server.",
                flags: MessageFlags.Ephemeral,
            });
        }
        return unacceptCommand(interaction, interaction.member);
    }
};
UnacceptCommand = __decorate([
    ApplyOptions({
        name: "unaccept",
        description: "Remove your discusser role",
        enabled: !!config.discussionModeration,
    })
], UnacceptCommand);
export { UnacceptCommand };
let DiscussAdminCommand = class DiscussAdminCommand extends Subcommand {
    logger = createLogger("DiscussAdminCommand");
    registerApplicationCommands(registry) {
        registry.registerChatInputCommand((builder) => builder
            .setName(this.name)
            .setDescription(this.description)
            .addSubcommand((sub) => sub
            .setName("reports-on")
            .setDescription("List reports on messages authored by a user")
            .addUserOption((opt) => opt.setName("user").setDescription("User to check reports for").setRequired(true)))
            .addSubcommand((sub) => sub
            .setName("reports-by")
            .setDescription("List reports made by a user")
            .addUserOption((opt) => opt.setName("user").setDescription("User to check reports for").setRequired(true)))
            .addSubcommand((sub) => sub
            .setName("ban-status")
            .setDescription("Show ban status of a user")
            .addUserOption((opt) => opt.setName("user").setDescription("User to check ban status for").setRequired(true)))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages), {
            idHints: config.discussionModeration?.discussAdminIdHint,
        });
    }
    async chatInputReportsOn(interaction) {
        return handleInteractionErrors(interaction, this.logger, async () => {
            const user = interaction.options.getUser("user", true);
            const reports = await MessageReport.findAll({
                where: { authorId: user.id },
                limit: 15,
                order: [["createdAt", "DESC"]],
            });
            await this.maybeShowReports(interaction, reports, `Reports on <@${user.id}>`);
        });
    }
    async chatInputReportsBy(interaction) {
        return handleInteractionErrors(interaction, this.logger, async () => {
            const user = interaction.options.getUser("user", true);
            const reports = await MessageReport.findAll({
                where: { reporterId: user.id },
                limit: 15,
                order: [["createdAt", "DESC"]],
            });
            await this.maybeShowReports(interaction, reports, `Reports made by <@${user.id}>`);
        });
    }
    formatReports(reports) {
        return reports.map((r) => {
            const timestamp = `<t:${Math.floor(r.createdAt.getTime() / 1000)}:f>`;
            return {
                name: `${r.messageUrl} on ${timestamp}`,
                value: r.reason ?? "No reason provided",
            };
        });
    }
    maybeShowReports(interaction, reports, description) {
        if (reports.length === 0) {
            return interaction.reply({ content: `No reports found.`, flags: MessageFlags.Ephemeral });
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
        });
    }
    async chatInputBanStatus(interaction) {
        return handleInteractionErrors(interaction, this.logger, async () => {
            const user = interaction.options.getUser("user", true);
            const ban = await DiscussionBan.findOne({ where: { userId: user.id } });
            if (!(ban && new Date() < ban.expiresAt)) {
                return interaction.reply({
                    content: `<@${user.id}> is not banned from discussions.`,
                    flags: MessageFlags.Ephemeral,
                });
            }
            const expiresAt = `<t:${Math.floor(ban.expiresAt.getTime() / 1000)}:R>`;
            const reason = ban.reason ? `Reason: ${ban.reason}` : "No reason provided";
            return interaction.reply({
                content: `<@${user.id}> is banned until ${expiresAt}. ${reason}`,
            });
        });
    }
    async chatInputUnban(interaction) {
        return handleInteractionErrors(interaction, this.logger, async () => {
            const user = interaction.options.getUser("user", true);
            const ban = await DiscussionBan.findOne({ where: { userId: user.id } });
            if (!ban) {
                return interaction.reply({
                    content: `<@${user.id}> is not banned from discussions.`,
                    flags: MessageFlags.Ephemeral,
                });
            }
            await ban.destroy();
            return interaction.reply({
                content: `<@${user.id}> has been unbanned from discussions.`,
            });
        });
    }
};
DiscussAdminCommand = __decorate([
    ApplyOptions({
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
], DiscussAdminCommand);
export { DiscussAdminCommand };
//# sourceMappingURL=discussion-moderation-commands.js.map