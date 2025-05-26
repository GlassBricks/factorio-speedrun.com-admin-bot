import { ApplicationCommandRegistry, Command } from "@sapphire/framework"
import {
  ChatInputCommandInteraction,
  Client,
  ContextMenuCommandInteraction,
  ContextMenuCommandType,
  InteractionContextType,
  Message,
} from "discord.js"
import { report } from "../components/report.js"
import { ApplicationCommandType } from "discord-api-types/v10"

export class ReportCommand extends Command {
  constructor(ctx: Command.LoaderContext, options: Command.Options) {
    super(ctx, {
      name: "report",
      description: "Report a message",
      ...options,
    })
  }

  override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .setContexts(InteractionContextType.Guild)
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription('Message to report (right click -> "Copy message link" -> paste here)')
            .setRequired(true),
        )
        .addStringOption((option) => option.setName("reason").setDescription("Report reason"))
        .setDefaultMemberPermissions("0"),
    )
    registry.registerContextMenuCommand((builder) =>
      builder
        .setName("Report Message")
        .setContexts(InteractionContextType.Guild)
        .setType(ApplicationCommandType.Message as ContextMenuCommandType)
        .setDefaultMemberPermissions("0"),
    )
  }

  override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const messageLink = interaction.options.getString("message", true)
    const message = await getMessageFromLink(interaction.client, messageLink).catch((err) => {
      interaction.client.logger.error("Failed to fetch message from link:", err)
      return undefined
    })
    if (!message) {
      return interaction.reply({
        content:
          "Could not find the provided message! Please check the link, or contact the admins/devs if you think this is a bug.",
        ephemeral: true,
      })
    }
    if (!interaction.inCachedGuild()) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      })
    }
    return report(interaction, interaction.member, message, interaction.options.getString("reason") ?? undefined)
  }

  override async contextMenuRun(interaction: ContextMenuCommandInteraction) {
    if (!interaction.inCachedGuild() || !interaction.isMessageContextMenuCommand()) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      })
    }
    const message = interaction.targetMessage

    return report(interaction, interaction.member, message, undefined)
  }
}

async function getMessageFromLink(client: Client<true>, link: string): Promise<Message | undefined> {
  const [, guildId, channelId, messageId] = /https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/.exec(link) || []
  if (!guildId || !channelId || !messageId) return undefined
  const guild = await client.guilds.fetch(guildId)
  const channel = await guild.channels.fetch(channelId)
  if (!channel || !channel.isTextBased()) return undefined
  return channel.messages.fetch(messageId)
}
