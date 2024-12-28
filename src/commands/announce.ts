import { ApplicationCommandRegistry, Command } from "@sapphire/framework"
import { ApplyOptions } from "@sapphire/decorators"
import config from "../config.js"
import {
  ActionRowBuilder,
  Channel,
  ChannelType,
  ChatInputCommandInteraction,
  GuildBasedChannel,
  GuildMember,
  InteractionContextType,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  NewsChannel,
  PermissionFlagsBits,
  SlashCommandBuilder,
  Snowflake,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js"

export const textBasedChannels = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const
export const DeleteOwnMessageIdPrefix = "announce.deleteOwnMessage:"
export const CreateAnnouncementModalIdPrefix = "announce.createAnnouncementModal:"
export type AnnouncementChannel = Extract<Channel, { type: (typeof textBasedChannels)[number] }>

export function hasRequiredRolesForAnnounce(user: GuildMember | undefined): string | undefined {
  const requiredRoles = config.announceCommand?.requiredRoles
  if (requiredRoles && (!user || !user.roles.cache.some((role) => requiredRoles?.includes(role.id)))) {
    return `You must be one of the following roles to use this:\n${requiredRoles.map((role) => `<@&${role}>`).join(", ")}`
  }
  return undefined
}

abstract class BaseAnnounce extends Command {
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
    return this.createModal(interaction, channel)
  }

  private async createModal(interaction: ChatInputCommandInteraction<"cached">, channel: AnnouncementChannel) {
    const channelName = channel.name
    const modal = new ModalBuilder()
      .setCustomId(`${CreateAnnouncementModalIdPrefix}${channel.id}`)
      .setTitle(`Create announcement to ${channelName}`)
      .addComponents(
        new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("message")
            .setLabel("Message")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(2000)
            .setRequired(true),
        ),
      )

    await interaction.showModal(modal)
    // The rest is handled in ./listeners/announce-handler.ts
  }

  protected async tryGetChannel(
    interaction: ChatInputCommandInteraction,
    channelId: Snowflake,
  ): Promise<GuildBasedChannel | null> {
    try {
      return await interaction.guild!.channels.fetch(channelId)
    } catch {
      return null
    }
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
    if (!(await this.canSendInChannel(channel))) {
      await interaction.reply({
        content: `<@${interaction.client.user.id}> doesn't have permission to send messages to <#${channel.id}>. Please add me!`,
        ephemeral: true,
      })
      return false
    }
    const logChannel = await this.tryGetChannel(interaction, config.announceCommand!.auditLogChannelId)
    if (!logChannel) {
      await interaction.reply({
        content: `Bot couldn't find the _logs_ channel! Contact a developer/administrator if you think this is a bug.`,
        ephemeral: true,
      })
      return false
    }
    if (!(await this.canSendInChannel(logChannel))) {
      await interaction.reply({
        content: `<@${interaction.client.user.id}> doesn't have permission to send messages to <#${logChannel.id}>. Please add me!`,
        ephemeral: true,
      })
    }
    return true
  }

  private async canSendInChannel(channel: GuildBasedChannel) {
    return (
      channel.isTextBased() &&
      channel
        .permissionsFor(await channel.guild.members.fetchMe())
        .has(PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel, true)
    )
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
    const channel = await this.tryGetChannel(interaction, config.announceCommand!.announceChannelId)
    if (!channel || !(textBasedChannels as readonly ChannelType[]).includes(channel.type)) return undefined
    return channel as TextChannel | NewsChannel
  }
}
