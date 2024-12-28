import { ApplicationCommandRegistry, Command } from "@sapphire/framework"
import { ApplyOptions } from "@sapphire/decorators"
import config from "../config.js"
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Channel,
  ChannelType,
  ChatInputCommandInteraction,
  ComponentType,
  GuildMember,
  InteractionContextType,
  Message,
  NewsChannel,
  PermissionFlagsBits,
  SlashCommandBuilder,
  Snowflake,
  TextChannel,
} from "discord.js"
import { createLogger } from "../logger.js"
import { botCanSendInChannel } from "../utils.js"

export const textBasedChannels = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const
export const DeleteOwnMessageIdPrefix = "announce.deleteOwnMessage:"
export type AnnouncementChannel = Extract<Channel, { type: (typeof textBasedChannels)[number] }>

export function hasRequiredRolesForAnnounce(user: GuildMember | undefined): string | undefined {
  const requiredRoles = config.announceCommand?.requiredRoles
  if (requiredRoles && (!user || !user.roles.cache.some((role) => requiredRoles?.includes(role.id)))) {
    return `You must be one of the following roles to use this:\n${requiredRoles.map((role) => `<@&${role}>`).join(", ")}`
  }
  return undefined
}

abstract class BaseAnnounce extends Command {
  protected logger = createLogger("[Announce]")

  abstract configureCommandOptions(b: SlashCommandBuilder): void

  abstract getChannel(interaction: ChatInputCommandInteraction): Promise<TextChannel | NewsChannel | undefined>

  abstract idHints(): Snowflake[] | undefined

  override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    const theConfig = config.announceCommand
    if (!theConfig) return
    registry.registerChatInputCommand(
      (b) => {
        b.setName(this.options.name!)
          .setDescription(this.options.description!)
          .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
          .setContexts([InteractionContextType.Guild])
        this.configureCommandOptions(b)
      },
      {
        guildIds: theConfig.guildIds,
        idHints: this.idHints(),
      },
    )
  }

  override async chatInputRun(interaction: ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: `Bot isn't on the server!`, ephemeral: true })
      return
    }
    const channel = await this.getChannel(interaction)
    if (!channel) {
      await interaction.reply({
        content:
          "Bot couldn't find channel to announce to! Contact a develeoper/administrator if you think this is a bug.",
        ephemeral: true,
      })
      return
    }
    if (!(await this.canAnnounce(interaction, channel))) return
    return this.createMessage(interaction, channel)
  }

  private async createMessage(
    interaction: ChatInputCommandInteraction<"cached">,
    channel: AnnouncementChannel,
  ): Promise<void> {
    const messageContent = interaction.options.getString("message", true).replaceAll("  ", "\n")
    let message: Message
    try {
      message = await channel.send(messageContent)
      this.logger.info("Announcement created", message.url)
    } catch (error: unknown) {
      this.logger.error(error)
      const message = error instanceof Error ? error.message : "Unknown error"
      await interaction.reply({
        content: `Error trying to send message: ${message}. Contact a developer you think this is a bug.`,
        ephemeral: true,
      })
      return
    }

    const deleteButton = new ActionRowBuilder<ButtonBuilder>({
      components: [
        {
          type: ComponentType.Button,
          custom_id: `${DeleteOwnMessageIdPrefix}${message.channel.id},${message.id}`,
          label: "Delete announcement",
          style: ButtonStyle.Danger,
        },
      ],
    })

    const auditLogChannel = await interaction.guild.channels.fetch(config.announceCommand!.auditLogChannelId)
    if (
      !auditLogChannel ||
      !auditLogChannel.isTextBased() ||
      !(textBasedChannels as readonly ChannelType[]).includes(auditLogChannel.type) ||
      !(await botCanSendInChannel(auditLogChannel as AnnouncementChannel))
    ) {
      await interaction.reply({
        content: `Announcement created: ${message.url}.\n*Announcement log channel is invalid! Check it exists and bot has permission to send messages to it.*`,
        components: [deleteButton],
        ephemeral: true,
      })
      return
    }

    await Promise.all([
      auditLogChannel.send({
        content: `<@${interaction.user.id}> used /${this.options.name}: ${message.url}`,
        components: [deleteButton],
      }),
      interaction.reply({
        content: `Message created: ${message.url}.\n*Logged in <#${auditLogChannel.id}>. See the log message to delete the message*`,
        ephemeral: true,
      }),
    ])
  }

  private async canAnnounce(
    interaction: ChatInputCommandInteraction<"cached">,
    channel: AnnouncementChannel,
  ): Promise<boolean> {
    const user = await interaction.guild.members.fetch(interaction.user.id)
    const requiredRoleMessage = hasRequiredRolesForAnnounce(user)
    if (requiredRoleMessage) {
      await interaction.reply({
        content: requiredRoleMessage,
        ephemeral: true,
      })
      return false
    }
    if (channel.guildId !== interaction.guildId) {
      await interaction.reply({
        content: `Can't announce on a different server!`,
        ephemeral: true,
      })
      return false
    }
    if (!user) {
      await interaction.reply({ content: `You, aren't on the server you're trying to announce???`, ephemeral: true })
      return false
    }
    if (!channel.permissionsFor(user).has(PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel, true)) {
      await interaction.reply({
        content: `You don't have permission to send messages in that channel!`,
        ephemeral: true,
      })
      return false
    }
    if (!(await botCanSendInChannel(channel))) {
      await interaction.reply({
        content: `<@${interaction.client.user.id}> doesn't have permission to send messages in that channel. Please add me!`,
        ephemeral: true,
      })
      return false
    }
    return true
  }
}

@ApplyOptions<Command.Options>({
  name: config.announceCommand?.announceToCommandName,
  description: config.announceCommand?.announceToDescription,
  enabled: !!config.announceCommand,
})
export class AnnounceTo extends BaseAnnounce {
  configureCommandOptions(b: SlashCommandBuilder) {
    b.addChannelOption((b) =>
      b
        .setName("channel")
        .setDescription("The channel to announce in. Both you and the bot need permission to send messages to it.")
        .setRequired(true)
        .addChannelTypes(...textBasedChannels),
    ).addStringOption((b) =>
      b.setName("message").setDescription("The message to announce").setRequired(true).setMaxLength(2000),
    )
  }

  idHints(): Snowflake[] | undefined {
    return config.announceCommand?.announceToIdHint
  }

  getChannel(interaction: ChatInputCommandInteraction): Promise<TextChannel | NewsChannel | undefined> {
    return Promise.resolve(interaction.options.getChannel("channel", true, textBasedChannels))
  }
}

@ApplyOptions<Command.Options>({
  name: config.announceCommand?.announceCommandName,
  description: config.announceCommand?.announceDescription,
  enabled: !!config.announceCommand,
})
export class Announce extends BaseAnnounce {
  configureCommandOptions(b: SlashCommandBuilder) {
    b.addStringOption((b) =>
      b.setName("message").setDescription("The message to announce").setRequired(true).setMaxLength(2000),
    )
  }

  idHints(): Snowflake[] | undefined {
    return config.announceCommand?.announceIdHint
  }

  async getChannel(interaction: ChatInputCommandInteraction): Promise<TextChannel | NewsChannel | undefined> {
    const channel = await interaction.guild!.channels.fetch(config.announceCommand!.announceChannelId)
    if (!channel || !(textBasedChannels as readonly ChannelType[]).includes(channel.type)) return undefined
    return channel as TextChannel | NewsChannel
  }
}
