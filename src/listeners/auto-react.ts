import { Events, Listener } from "@sapphire/framework"
import { Message } from "discord.js"
import config, { AutoReactConfig } from "../config.js"

export class AutoReactListener extends Listener<typeof Events.PrefixedMessage> {
  private readonly config: (AutoReactConfig & {
    regexpCompiled: RegExp
  })[]

  constructor(context: Listener.LoaderContext) {
    super(context, {
      event: Events.PrefixedMessage,
      enabled: config.autoReact !== undefined && config.autoReact.length > 0,
    })
    this.config =
      config.autoReact?.map((entry) => ({
        ...entry,
        regexpCompiled: new RegExp(entry.regex, "i"),
      })) ?? []
  }

  override async run(message: Message) {
    const user = message.author
    for (const { forUsers, regexpCompiled, reaction } of this.config) {
      if (forUsers && !forUsers.includes(user.id)) continue
      if (!regexpCompiled.test(message.content)) continue
      await message.react(reaction)
      break
    }
  }
}
