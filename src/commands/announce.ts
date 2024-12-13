import { ApplicationCommandRegistry, Command } from "@sapphire/framework"
import { ApplyOptions } from "@sapphire/decorators"
import config from "../config.js"
import {
  Channel,
  ChannelType,
  ChatInputCommandInteraction,
  InteractionContextType,
  Message,
  PermissionFlagsBits,
} from "discord.js"
import { createLogger } from "../logger.js"

const textBasedChannels = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const

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
    const user = await interaction.guild.members.fetch(interaction.user.id)
    const requiredRoles = config.announceCommand?.requiredRoles
    if (requiredRoles) {
      const hasRole = user.roles.cache.some((role) => requiredRoles?.includes(role.id))
      if (!hasRole) {
        await interaction.reply({
          content: `You must be one of the following roles to use /${config.announceCommand!.commandName}:\n${requiredRoles.map((role) => `<@&${role}>`).join(", ")}`,
          ephemeral: true,
        })
        return
      }
    }

    const channel = interaction.options.getChannel("channel", true, textBasedChannels)
    if (channel.guildId !== interaction.guildId) {
      await interaction.reply({
        content: `Can't announce on a different server!`,
        ephemeral: true,
      })
      return
    }
    if (!user) {
      await interaction.reply({ content: `You, aren't on the server you're trying to announce???`, ephemeral: true })
      return
    }
    if (!channel.permissionsFor(user).has(PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel, true)) {
      await interaction.reply({
        content: `You don't have permission to send messages in that channel!`,
        ephemeral: true,
      })
      return
    }
    if (!(await this.canSendInChannel(channel))) {
      await interaction.reply({
        content: `<@${interaction.client.user.id}> doesn't have permission to send messages in that channel. Please add me!`,
        ephemeral: true,
      })
      return
    }

    const messageContent = interaction.options.getString("message", true)
    let message: Message
    try {
      message = await channel.send(messageContent)
    } catch (error: unknown) {
      this.logger.error(error)
      await interaction.reply({
        content: `Error trying to send message! Contact bot owner if you think this is a bug.`,
        ephemeral: true,
      })
      return
    }
    return interaction.reply({ content: `Message created: ${message.url}`, ephemeral: true })
  }

  private async canSendInChannel(channel: Extract<Channel, { type: (typeof textBasedChannels)[number] }>) {
    return channel
      .permissionsFor(await channel.guild.members.fetchMe())
      .has(PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel, true)
  }
}
