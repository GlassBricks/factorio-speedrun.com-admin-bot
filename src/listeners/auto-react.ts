import { Events, Listener } from "@sapphire/framework"
import { Message } from "discord.js"
import config, { AutoReactConfig } from "../config.js"

export class AutoReactListener extends Listener<typeof Events.PreMessageParsed> {
  private readonly config: (AutoReactConfig & {
    regexpCompiled: RegExp
  })[]

  constructor(context: Listener.LoaderContext) {
    super(context, {
      event: Events.PreMessageParsed,
      enabled: config.autoReact !== undefined && config.autoReact.length > 0,
    })
    this.config =
      config.autoReact?.map((entry) => ({
        ...entry,
        regexpCompiled: new RegExp(entry.regex, "i"),
      })) ?? []
  }

  override async run(message: Message) {
    const content = message.content
    const userId = message.author
    const channelId = message.channelId
    const botMentioned = content.includes(`<@${this.container.client.user!.id}>`)

    for (const { onBotMention, users, channels, regexpCompiled, reactions } of this.config) {
      if (onBotMention && !botMentioned) continue
      if (users && !users.includes(userId.id)) continue
      if (channels && !channels.includes(channelId)) continue
      if (!regexpCompiled.test(message.content)) continue
      for (const reaction of reactions) {
        await message.react(reaction)
      }
      break
    }
  }
}
