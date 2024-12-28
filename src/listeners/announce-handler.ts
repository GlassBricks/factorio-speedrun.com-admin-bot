import { ApplyOptions } from "@sapphire/decorators"
import { Events, Listener } from "@sapphire/framework"
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Interaction, Message } from "discord.js"
import { CreateAnnouncementModalIdPrefix, DeleteOwnMessageIdPrefix } from "../commands/announce.js"
import { createLogger } from "../logger.js"
import config from "../config.js"

@ApplyOptions<Listener.Options>({ event: Events.InteractionCreate })
export class AnnounceHandler extends Listener<typeof Events.InteractionCreate> {
  protected logger = createLogger("[AnnounceHandler]")

  async run(interaction: Interaction) {
    if (!interaction.isModalSubmit()) return
    if (!interaction.customId.startsWith(CreateAnnouncementModalIdPrefix)) return

    const messageContent = interaction.fields.getTextInputValue("message")

    const channelId = interaction.customId.slice(CreateAnnouncementModalIdPrefix.length)
    const channel = await interaction.guild!.channels.fetch(channelId)
    if (!channel || !channel.isTextBased()) return

    let message: Message
    try {
      message = await channel.send(messageContent)
      this.logger.info("Announcement created", message.url)
    } catch (error: unknown) {
      this.logger.error(error)
      const message = error instanceof Error ? error.message : "Unknown error"
      await interaction.reply({
        content: `Error trying to send message: ${message}. Contact a developer you think this is a bug.`,
        ephemeral: true,
      })
      return
    }

    // const auditLogChannel = await interaction.guild!.channels.fetch(config.announceCommand!.auditLogChannelId)
    const auditLogChannel = interaction.guild!.channels.cache.get(config.announceCommand!.auditLogChannelId)
    if (!auditLogChannel || !auditLogChannel.isTextBased()) {
      this.logger.error("Could not find audit log channel")
      await message.delete()
      await interaction.reply({
        content: `Could not create log message in <#${config.announceCommand!.auditLogChannelId}>! Annoucnement deleted.`,
        ephemeral: true,
      })
      return
    }

    const deleteButton = new ActionRowBuilder<ButtonBuilder>({
      components: [
        {
          type: ComponentType.Button,
          custom_id: `${DeleteOwnMessageIdPrefix}${message.channel.id},${message.id}`,
          label: "Delete announcement",
          style: ButtonStyle.Danger,
        },
      ],
    })
    await Promise.all([
      auditLogChannel.send({
        content: `<@${interaction.user.id}> used /${this.options.name}: ${message.url}`,
        components: [deleteButton],
      }),
      interaction.reply({
        content: `Message created: ${message.url}.\n*Logged in <#${auditLogChannel.id}>. See the log to delete the message*`,
        ephemeral: true,
      }),
    ])
  }
}
