import { Channel, GuildChannel, PermissionFlagsBits } from "discord.js"

export async function botCanSendInChannel(channel: Channel): Promise<boolean> {
  return (
    channel.isTextBased() &&
    channel.isSendable() &&
    (channel instanceof GuildChannel
      ? channel
          .permissionsFor(await channel.guild.members.fetchMe())
          .has(PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel, true)
      : true)
  )
}
