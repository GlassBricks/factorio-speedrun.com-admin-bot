import { Command } from "@sapphire/framework"
import { Message } from "discord.js"

// noinspection JSUnusedGlobalSymbols
export class PingCommand extends Command {
  constructor(ctx: Command.LoaderContext, options: Command.Options) {
    super(ctx, {
      name: "ping",
      description: "Test if the bot is still alive",
      ...options,
    })
  }

  override async messageRun(message: Message) {
    this.container.logger.debug("PingCommand", "Received message:", message.content)
    const reply = await message.reply({
      content: "I'm alive!",
    })

    const ping = Math.round(this.container.client.ws.ping)
    const diff = reply.createdTimestamp - message.createdTimestamp
    return reply.edit(`I'm alive! (Round trip: ${diff}ms. Heartbeat: ${ping}ms.)`)
  }
}
