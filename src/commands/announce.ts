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
  DiscordAPIError,
  Events,
  GuildMember,
  Interaction,
  InteractionContextType,
  Message,
  PermissionFlagsBits,
} from "discord.js"
import { createLogger } from "../logger.js"

const textBasedChannels = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const
const DeleteOwnMessageIdPrefix = "announce.deleteOwnMessage:"
type AnnouncementChannel = Extract<Channel, { type: (typeof textBasedChannels)[number] }>

@ApplyOptions<Command.Options>({
  name: config.announceCommand?.commandName,
  description: config.announceCommand?.commandDescription,
  enabled: !!config.announceCommand,
})
export class Announce extends Command {
  private logger = createLogger("[Announce]")

  override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    const announceCommand = config.announceCommand
    if (!announceCommand) return
    registry.registerChatInputCommand(
      (b) =>
        b
          .setName(announceCommand.commandName)
          .setDescription(announceCommand.commandDescription)
          .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
          .setContexts([InteractionContextType.Guild])
          .addChannelOption((b) =>
            b
              .setName("channel")
              .setDescription(
                "The channel to announce in. Both you and the bot need permission to send messages to it.",
              )
              .setRequired(true)
              .addChannelTypes(...textBasedChannels),
          )
          .addStringOption((b) =>
            b.setName("message").setDescription("The message to announce").setRequired(true).setMaxLength(2000),
          ),
      {
        guildIds: announceCommand.guildIds,
        idHints: announceCommand.idHints,
      },
    )
  }

  override async chatInputRun(interaction: ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: `Bot isn't on the server!`, ephemeral: true })
      return
    }
    const channel = interaction.options.getChannel("channel", true, textBasedChannels)
    if (!(await this.canAnnounce(interaction, channel))) return
    return this.createMessage(interaction, channel)
  }

  private async createMessage(
    interaction: ChatInputCommandInteraction<"cached">,
    channel: AnnouncementChannel,
  ): Promise<void> {
    const messageContent = interaction.options.getString("message", true)
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
      !(await this.canSendInChannel(auditLogChannel as AnnouncementChannel))
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
        content: `<@${interaction.user.id}> used /${config.announceCommand!.commandName}: ${message.url}`,
        components: [deleteButton],
      }),
      interaction.reply({
        content: `Message created: ${message.url}.\n*Also recorded in <#${auditLogChannel.id}>.*`,
        ephemeral: true,
      }),
    ])
  }

  private hasRequiredRoles(user: GuildMember | undefined): string | undefined {
    const requiredRoles = config.announceCommand?.requiredRoles
    if (requiredRoles && (!user || !user.roles.cache.some((role) => requiredRoles?.includes(role.id)))) {
      return `You must be one of the following roles to use this:\n${requiredRoles.map((role) => `<@&${role}>`).join(", ")}`
    }
    return undefined
  }

  private async canAnnounce(
    interaction: ChatInputCommandInteraction<"cached">,
    channel: AnnouncementChannel,
  ): Promise<boolean> {
    const user = await interaction.guild.members.fetch(interaction.user.id)
    const requiredRoleMessage = this.hasRequiredRoles(user)
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
        content: `<@${interaction.client.user.id}> doesn't have permission to send messages in that channel. Please add me!`,
        ephemeral: true,
      })
      return false
    }
    return true
  }

  private async canSendInChannel(channel: AnnouncementChannel) {
    return channel
      .permissionsFor(await channel.guild.members.fetchMe())
      .has(PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel, true)
  }

  private async onInteractionCreate(interaction: Interaction) {
    if (!interaction.isButton()) return
    const customId: string = interaction.customId
    if (!interaction.isButton() || !customId.startsWith(DeleteOwnMessageIdPrefix)) return
    const [channelId, messageId] = customId.substring(DeleteOwnMessageIdPrefix.length).split(",")
    if (!channelId || !messageId) return

    const user = await interaction.guild?.members.fetch(interaction.user.id)
    const requiredRoleMessage = this.hasRequiredRoles(user)
    if (requiredRoleMessage) {
      await interaction.reply({
        content: requiredRoleMessage,
        ephemeral: true,
      })
      return
    }

    let originalMessage: Message | undefined
    try {
      originalMessage = await interaction.message.fetch()
    } catch (e) {
      if (e instanceof DiscordAPIError && e.code === 10008) {
        originalMessage = undefined
      } else {
        throw e
      }
    }

    const channel = await interaction.guild?.channels.fetch(channelId)
    if (!channel || !channel.isTextBased()) return
    let message: Message<true>
    try {
      message = await channel.messages.fetch(messageId)
    } catch (e) {
      if (e instanceof DiscordAPIError && e.code === 10008) {
        await interaction.reply({ content: `Original announcement message not found!`, ephemeral: true })
        await originalMessage?.delete()
        return
      }
      throw e
    }
    await message.delete()
    if (originalMessage) {
      await originalMessage.delete()
    } else {
      await interaction.reply({ content: `Message deleted!`, ephemeral: true })
    }
  }

  override onLoad() {
    this.container.client.on(Events.InteractionCreate, (interaction) => {
      this.onInteractionCreate(interaction).catch((error) => {
        this.logger.error(error)
      })
    })
  }
}
