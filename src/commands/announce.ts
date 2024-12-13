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
  Interaction,
  InteractionContextType,
  Message,
  PermissionFlagsBits,
} from "discord.js"
import { createLogger } from "../logger.js"

const textBasedChannels = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const
const DeleteOwnMessageIdPrefix = "announce.deleteOwnMessage:"

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
    channel: Extract<Channel, { type: (typeof textBasedChannels)[number] }>,
  ) {
    const messageContent = interaction.options.getString("message", true)
    let message: Message
    try {
      message = await channel.send(messageContent)
      this.logger.info("Announcement created", message.url)
    } catch (error: unknown) {
      this.logger.error(error)
      await interaction.reply({
        content: `Error trying to send message! Contact bot owner if you think this is a bug.`,
        ephemeral: true,
      })
      return
    }

    const row = new ActionRowBuilder<ButtonBuilder>({
      components: [
        {
          type: ComponentType.Button,
          custom_id: `${DeleteOwnMessageIdPrefix}${message.channel.id},${message.id}`,
          label: "Delete announcement message",
          style: ButtonStyle.Danger,
        },
      ],
    })

    return interaction.reply({
      content: `Message created: ${message.url}`,
      components: [row],
      ephemeral: true,
    })
  }

  private async canAnnounce(
    interaction: ChatInputCommandInteraction<"cached">,
    channel: Extract<Channel, { type: (typeof textBasedChannels)[number] }>,
  ): Promise<boolean> {
    const user = await interaction.guild.members.fetch(interaction.user.id)
    const requiredRoles = config.announceCommand?.requiredRoles
    if (requiredRoles) {
      const hasRole = user.roles.cache.some((role) => requiredRoles?.includes(role.id))
      if (!hasRole) {
        await interaction.reply({
          content: `You must be one of the following roles to use /${config.announceCommand!.commandName}:\n${requiredRoles.map((role) => `<@&${role}>`).join(", ")}`,
          ephemeral: true,
        })
        return false
      }
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

  private async canSendInChannel(channel: Extract<Channel, { type: (typeof textBasedChannels)[number] }>) {
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
    const channel = await interaction.guild?.channels.fetch(channelId)
    if (!channel || !channel.isTextBased()) return
    let message: Message<true>
    try {
      message = await channel.messages.fetch(messageId)
    } catch (e) {
      if (e instanceof DiscordAPIError && e.code === 10008) {
        await interaction.reply({ content: `Original announcement message not found!`, ephemeral: true })
        return
      }
      throw e
    }
    await message.delete()
    await interaction.reply({ content: `Message deleted!`, ephemeral: true })
  }

  override onLoad() {
    this.container.client.on(Events.InteractionCreate, (interaction) => {
      this.onInteractionCreate(interaction).catch((error) => {
        this.logger.error(error)
      })
    })
  }
}
