// noinspection JSUnusedGlobalSymbols

import { ApplicationCommandRegistry, Command } from "@sapphire/framework"
import { ChatInputCommandInteraction } from "discord.js"

export class PingCommand extends Command {
  constructor(ctx: Command.LoaderContext, options: Command.Options) {
    super(ctx, {
      name: "ping",
      description: "Pong!",
      ...options,
    })
  }

  override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    registry.registerChatInputCommand(
      (b) =>
        b //
          .setName(this.name)
          .setDescription(this.description),
      {
        idHints: ["1313691492375728230"],
      },
    )
  }

  override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const msg = await interaction.reply({
      content: "I'm alive!",
      ephemeral: true,
      fetchReply: true,
    })

    const diff = msg.createdTimestamp - interaction.createdTimestamp
    const ping = Math.round(this.container.client.ws.ping)
    return interaction.editReply(`I'm alive! (Round trip: ${diff}ms. Heartbeat: ${ping}ms.)`)
  }
}
