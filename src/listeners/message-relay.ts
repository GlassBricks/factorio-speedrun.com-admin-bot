import { Events, Listener } from "@sapphire/framework"
import { ApplyOptions } from "@sapphire/decorators"
import config, { MessageRelayConfig } from "../config.js"
import { Message, OmitPartialGroupDMChannel } from "discord.js"

@ApplyOptions<Listener.Options>({
  event: Events.MessageCreate,
  enabled: config.messageRelay && config.messageRelay?.length > 0,
})
export class MessageRelayListener extends Listener {
  private static relayMap = new Map<string, MessageRelayConfig>(config.messageRelay?.map((c) => [c.fromChannelId, c]))

  formatMessage(config: MessageRelayConfig, template: string, user: string, originalContent: string): string {
    return template
      .replace("%f", `<#${config.fromChannelId}>`)
      .replace("%t", `<#${config.toChannelId}>`)
      .replace("%u", `<@${user}>`)
      .replace("%m", originalContent)
  }

  async run(message: OmitPartialGroupDMChannel<Message>) {
    if (message.author.bot) return // Ignore bot messages
    const relayConfig = MessageRelayListener.relayMap.get(message.channelId)
    if (!relayConfig) return
    await this.runForMessage(message, relayConfig)
  }

  private async runForMessage(message: OmitPartialGroupDMChannel<Message>, relayConfig: MessageRelayConfig) {
    const originalContent = message.content
    const formatMessage = (template: string) =>
      template
        .replace("%f", `<#${relayConfig.fromChannelId}>`)
        .replace("%t", `<#${relayConfig.toChannelId}>`)
        .replace("%u", `<@${message.author.id}>`)
        .replace("%m", originalContent)

    await Promise.all([
      relayConfig.dmMessage && message.author.send(formatMessage(relayConfig.dmMessage)),
      message.delete().catch(async () => {
        await message.channel.send(
          "Bot does not have permission to manage messages in the relay channel. Please contact an admin!",
        )
      }),
    ])

    const toChannelId = relayConfig.toChannelId
    const toChannel = await message.guild?.channels.fetch(toChannelId)
    if (!toChannel || !toChannel.isTextBased()) {
      await message.channel.send(
        "Specified relay channel does not exist or is not a text channel! Please contact an admin!",
      )
      return
    }

    await toChannel.send({
      content: formatMessage(relayConfig.relayMessage),
      allowedMentions: { parse: [] },
    })
  }
}
