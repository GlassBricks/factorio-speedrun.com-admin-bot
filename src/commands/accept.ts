// noinspection JSUnusedGlobalSymbols

import { ApplicationCommandRegistry, Command } from "@sapphire/framework"
import { ChatInputCommandInteraction, InteractionContextType, MessageFlags } from "discord.js"
import { acceptCommand } from "../components/discussion-moderate.js"
import config from "../config-file.js"

export class AcceptCommand extends Command {
  constructor(ctx: Command.LoaderContext, options: Command.Options) {
    super(ctx, {
      name: "accept",
      description: "Accept the rules and get the discusser role",
      enabled: !!config.discussionModeration?.accept,
      ...options,
    })
  }

  override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description).setContexts(InteractionContextType.Guild),
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
