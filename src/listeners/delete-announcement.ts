import { ApplyOptions } from "@sapphire/decorators"
import { Events, Listener } from "@sapphire/framework"
import { DiscordAPIError, Interaction, Message } from "discord.js"
import { DeleteOwnMessageIdPrefix, hasRequiredRolesForAnnounce } from "../commands/announce.js"

@ApplyOptions<Listener.Options>({ event: Events.InteractionCreate })
export class AnnouncementDeleteHandler extends Listener<typeof Events.InteractionCreate> {
  async run(interaction: Interaction) {
    if (!interaction.isButton()) return
    const customId: string = interaction.customId
    if (!interaction.isButton() || !customId.startsWith(DeleteOwnMessageIdPrefix)) return
    const [channelId, messageId] = customId.substring(DeleteOwnMessageIdPrefix.length).split(",")
    if (!channelId || !messageId) return

    const user = await interaction.guild?.members.fetch(interaction.user.id)
    const requiredRoleMessage = hasRequiredRolesForAnnounce(user)
    if (requiredRoleMessage) {
      await interaction.reply({
        content: requiredRoleMessage,
        ephemeral: true,
      })
      return
    }

    let originalMessage: Message | undefined
    try {
      originalMessage = await interaction.message.fetch()
    } catch (e) {
      if (e instanceof DiscordAPIError && e.code === 10008) {
        originalMessage = undefined
      } else {
        throw e
      }
    }

    const channel = await interaction.guild?.channels.fetch(channelId)
    if (!channel || !channel.isTextBased()) return
    let message: Message<true>
    try {
      message = await channel.messages.fetch(messageId)
    } catch (e) {
      if (e instanceof DiscordAPIError && e.code === 10008) {
        await interaction.reply({ content: `Original announcement message not found!`, ephemeral: true })
      }
      throw e
    }
    await message.delete()
    if (originalMessage) {
      // await originalMessage.delete()
      await originalMessage.edit({
        content: originalMessage.content + "\n*Announcement was deleted*",
        components: [],
      })
    } else {
      await interaction.reply({ content: `Message deleted!`, ephemeral: true })
    }
  }
}
