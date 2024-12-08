import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Events,
  Guild,
  GuildBasedChannel,
  InteractionContextType,
  Message,
  MessageReaction,
  PartialMessageReaction,
  Snowflake,
  TextBasedChannel,
} from "discord.js"
import { ApplicationCommandRegistry, Command, container, SapphireClient } from "@sapphire/framework"
import { VoteInitiateCommandConfig } from "./config.js"
import { Job, scheduleJob } from "node-schedule"
import { VoteInitiateMessage } from "./db/vote-initiate-message.js"

interface CurrentMessage {
  record: VoteInitiateMessage
  message: Message<true>
  expiryJob: Job
}

function messageLink(guildId: Snowflake, channelId: Snowflake, messageId: Snowflake) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`
}

function notifyRoles(roles: Snowflake[] | undefined) {
  return roles?.map((roleId) => `<@&${roleId}>\n`).join("") ?? ""
}

export class VoteInitiateCommandHandler {
  private currentMessage?: CurrentMessage

  constructor(readonly config: VoteInitiateCommandConfig) {}

  async onReady() {
    const messageRecord = await VoteInitiateMessage.findOne({
      where: { commandId: this.config.id, guildId: this.config.guildIds },
    })
    if (!messageRecord) {
      this.logDebug("No existing message.")
      return
    }

    const message = await this.findAssociatedMessage(messageRecord)
    if (!message) {
      this.logWarn("Deleting invalid record.")
      await messageRecord.destroy()
      return
    }
    this.logInfo("Found existing message, resuming.")
    await this.startListening(messageRecord, message)
  }

  async chatInputRun(interaction: ChatInputCommandInteraction) {
    const current = await this.getCurrentIfValid()
    if (current) await this.updateAndMaybeResolve()
    if (this.currentMessage) {
      const current = this.currentMessage
      await interaction.reply({
        content:
          this.config.alreadyRunningMessage +
          messageLink(current.message.guildId, current.message.channelId, current.message.id),
        ephemeral: true,
      })
      return
    }
    const guild = interaction.guild
    if (!guild || !this.config.guildIds.includes(guild.id)) {
      await interaction.reply({
        content: "Invalid guild configuration. Please contact an administrator.",
        ephemeral: true,
      })
      return
    }
    const channel = await guild.channels.fetch(this.config.postChannelId)
    if (!channel || !channel.isTextBased()) {
      await interaction.reply({
        content: "Invalid channel configuration. Please contact an administrator.",
        ephemeral: true,
      })
      return
    }
    // await this.createNewInitiationMessage(channel, interaction, guild)
    if (await this.promptForConfirmation(interaction)) {
      await this.createNewInitiationMessage(channel, interaction, guild)
    } else {
      await interaction.deleteReply()
    }
  }

  private async promptForConfirmation(interaction: ChatInputCommandInteraction) {
    const yesButton = new ButtonBuilder().setCustomId("yes").setLabel("Create vote").setStyle(ButtonStyle.Danger)

    const noButton = new ButtonBuilder().setCustomId("no").setLabel("Cancel").setStyle(ButtonStyle.Secondary)

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(yesButton, noButton)

    const response = await interaction.reply({
      content: this.formatMessage(this.config.confirmationMessage, undefined, new Date()),
      components: [row],
      ephemeral: true,
    })

    try {
      const confirmation = await response.awaitMessageComponent({
        filter: (i) => i.user.id === interaction.user.id,
        time: 60_000,
      })
      await confirmation.update({ components: [] })
      return confirmation.customId === "yes"
    } catch {
      return false
    }
  }

  private async createNewInitiationMessage(
    channel: GuildBasedChannel & TextBasedChannel,
    interaction: ChatInputCommandInteraction,
    guild: Guild,
  ) {
    this.logInfo("Creating new initiation message, from user id", interaction.user.id)
    const messageText = this.formatMessage(this.config.postMessage, this.config.postNotifyRoles, new Date())
    const message = await channel.send(messageText)
    const record = await VoteInitiateMessage.create({
      commandId: this.config.id,
      guildId: guild.id,
      postChannelId: channel.id,
      postMessageId: message.id,
    })
    await interaction.editReply({
      content: "Initiation message created: " + messageLink(guild.id, channel.id, message.id),
    })
    await Promise.all([this.startListening(record, message), message.react(this.config.reaction)])
  }

  private async getCurrentIfValid() {
    if (!this.currentMessage) return undefined
    const message = await this.findAssociatedMessage(this.currentMessage.record)
    if (!message) {
      this.stopListening()
      return undefined
    }
    this.currentMessage.message = message
    return this.currentMessage
  }

  private async findAssociatedMessage(messageRecord: VoteInitiateMessage) {
    // if message is invalid for any reason, delete from db and return undefined
    const guild = await container.client.guilds.fetch(messageRecord.guildId).catch(() => undefined)
    if (!guild) return
    if (messageRecord.postChannelId !== this.config.postChannelId) {
      this.logWarn("Post channel ID mismatch.")
      return undefined
    }
    const channel = await guild.channels.fetch(this.config.postChannelId)
    if (!channel || !channel.isTextBased()) {
      this.logWarn("Post channel is not a valid text channel.")
      return undefined
    }

    const message = await channel.messages.fetch(messageRecord.postMessageId).catch(() => undefined)
    if (!message) {
      this.logWarn("Message not found.")
      return undefined
    }
    return message
  }

  private async startListening(messageRecord: VoteInitiateMessage, message: Message<true>) {
    this.logInfo("Started listening for reactions")

    const expiryJob = scheduleJob(this.getExpiryDate(message.createdAt), () => this.updateAndMaybeResolve())

    this.currentMessage = {
      expiryJob,
      record: messageRecord,
      message,
    }
    // do one update immediately on start
    await this.updateAndMaybeResolve()
  }

  /** This may cause a pass. */
  async onReactAdded(reaction: MessageReaction | PartialMessageReaction) {
    if (!this.isMyReaction(reaction)) return
    reaction = await reaction.fetch()
    let numReacts = reaction?.count ?? 0
    this.logDebug("React added, current count:", numReacts)
    if (numReacts > 1 && reaction?.me) {
      // remove bot's reaction
      await reaction.users.remove(container.client.user!.id)
    }
    if (reaction?.me) numReacts--
    if (numReacts >= this.config.reactsRequired) {
      await this.pass()
    }
  }

  async onReactRemoved(reaction: MessageReaction | PartialMessageReaction) {
    if (!this.isMyReaction(reaction)) return
    reaction = await reaction.fetch()
    const count = reaction.count
    this.logDebug("React removed, current count:", count)
    if (reaction.count == 0) {
      await this.currentMessage?.message.react(this.config.reaction)
    }
  }

  private async updateAndMaybeResolve() {
    if (!this.currentMessage) return
    // for pass before checking for fail
    const currentReact = this.currentMessage.message.reactions.resolve(this.config.reaction)
    if (currentReact) {
      await this.onReactAdded(currentReact)
    }
    if (!this.currentMessage) return

    const message = this.currentMessage.message
    if (Date.now() >= this.getExpiryDate(message.createdAt).getTime()) {
      await this.fail()
    }
  }

  private async pass() {
    this.logInfo("Passed initiation")
    const currentMessage = this.currentMessage
    this.stopListening()

    if (currentMessage) {
      await Promise.all([
        currentMessage.message.channel.send(
          this.formatMessage(
            this.config.passedMessage,
            this.config.passedNotifyRoles,
            currentMessage.message.createdAt,
          ) +
            "\n\nOriginal message: " +
            messageLink(
              currentMessage.record.guildId,
              currentMessage.record.postChannelId,
              currentMessage.record.postMessageId,
            ),
        ),
      ])
    }
  }

  private async fail() {
    this.logInfo("Time expired, failing initiation")
    const message = this.currentMessage?.message
    this.stopListening()
    if (message) {
      await message.edit(this.formatMessage(this.config.failedMessage, this.config.postNotifyRoles, message.createdAt))
    }
  }

  private isMyReaction(reaction: MessageReaction | PartialMessageReaction) {
    return (
      this.currentMessage !== undefined &&
      reaction.message.id === this.currentMessage.message.id &&
      reaction.emoji.name === this.config.reaction
    )
  }

  private formatMessage(message: string, roles: Snowflake[] | undefined, messageCreateDate: Date): string {
    const expiryDate = this.getExpiryDate(messageCreateDate)
    const expiryDateRelative = `<t:${Math.floor(expiryDate.getTime() / 1000)}:R>`
    return (
      notifyRoles(roles) +
      message
        .replace("%n", this.config.reactsRequired.toString())
        .replace("%h", this.config.durationHours.toString())
        .replace("%c", `<#${this.config.postChannelId}>`)
        .replace("%e", expiryDateRelative)
        .replace("%r", this.config.reaction)
    )
  }

  private getExpiryDate(createdTime: Date) {
    return new Date(createdTime.getTime() + this.config.durationHours * 60 * 60 * 1000)
  }

  private stopListening() {
    const message = this.currentMessage
    if (message) {
      this.currentMessage = undefined
      message.expiryJob?.cancel()
      void message.record.destroy()
    }
  }

  logInfo(...message: unknown[]) {
    container.logger.info(`VoteInitiateCommandHandler[${this.config.commandName}]`, ...message)
  }

  logDebug(...message: unknown[]) {
    container.logger.debug(`VoteInitiateCommandHandler[${this.config.commandName}]`, ...message)
  }

  logWarn(...message: unknown[]) {
    container.logger.warn(`VoteInitiateCommandHandler[${this.config.commandName}]`, ...message)
  }

  logError(...message: unknown[]) {
    container.logger.error(`VoteInitiateCommandHandler[${this.config.commandName}]`, ...message)
  }

  createCommandClass() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const handler = this
    return class extends Command {
      constructor(context: Command.LoaderContext, options: Command.Options) {
        super(context, {
          name: handler.config.commandName,
          description: handler.config.commandDescription,
          runIn: ["GUILD_TEXT"],
          ...options,
        })
      }

      override registerApplicationCommands(registry: ApplicationCommandRegistry) {
        registry.registerChatInputCommand(
          (b) =>
            b //
              .setName(handler.config.commandName)
              .setDescription(handler.config.commandDescription)
              .setDefaultMemberPermissions("0")
              .setContexts([InteractionContextType.Guild]),
          {
            guildIds: handler.config.guildIds,
            idHints: handler.config.idHints,
          },
        )
      }

      override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await handler.chatInputRun(interaction)
      }
    }
  }
}

export function setUpVoteInitiateCommand(client: SapphireClient, config: VoteInitiateCommandConfig[] | undefined) {
  if (!config) return

  const voteInitiateCommandHandlers: VoteInitiateCommandHandler[] =
    config.map((voteOptions) => new VoteInitiateCommandHandler(voteOptions)) ?? []

  for (const handler of voteInitiateCommandHandlers) {
    const command = handler.createCommandClass()
    void container.stores.loadPiece({
      piece: command,
      name: command.name,
      store: "commands",
    })
  }

  client.once(Events.ClientReady, () => {
    for (const handler of voteInitiateCommandHandlers) {
      handler.onReady().catch((e) => handler.logError("onLoad:", e))
    }
  })
  client.on(Events.MessageReactionAdd, (reaction) => {
    for (const handler of voteInitiateCommandHandlers) {
      handler.onReactAdded(reaction).catch((e) => handler.logError("onReactAdded:", e))
    }
  })
  client.on(Events.MessageReactionRemove, (reaction) => {
    for (const handler of voteInitiateCommandHandlers) {
      handler.onReactRemoved(reaction).catch((e) => handler.logError("onReactRemoved:", e))
    }
  })
}
