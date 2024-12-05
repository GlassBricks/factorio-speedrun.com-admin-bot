// noinspection JSUnusedGlobalSymbols

import { ApplicationCommandRegistry } from "@sapphire/framework"
import { ChatInputCommandInteraction } from "discord.js"
import { TodoItem } from "../models/TodoItem.js"
import { Subcommand } from "@sapphire/plugin-subcommands"
import { ApplyOptions } from "@sapphire/decorators"

@ApplyOptions<Subcommand.Options>({
  name: "todo",
  description: "Look ma, I can CRUD stuff",
  subcommands: [
    {
      name: "add",
      chatInputRun: "add",
    },
    {
      name: "list",
      chatInputRun: "list",
    },
    {
      name: "delete",
      chatInputRun: "doDelete",
    },
    {
      name: "update",
      chatInputRun: "update",
    },
    {
      name: "clear",
      chatInputRun: "clear",
    },
  ],
})
export class Todo extends Subcommand {
  override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    registry.registerChatInputCommand((b) =>
      b //
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((b) =>
          b //
            .setName("add")
            .setDescription("Add a new item")
            .addStringOption((b) => b.setName("text").setDescription("The text of the item").setRequired(true)),
        )
        .addSubcommand((b) =>
          b //
            .setName("list")
            .setDescription("List all todo items"),
        )
        .addSubcommand((b) =>
          b //
            .setName("delete")
            .setDescription("Delete a todo items")
            .addNumberOption((b) => b.setName("id").setDescription("Todo id").setRequired(true)),
        )
        .addSubcommand((b) =>
          b //
            .setName("update")
            .setDescription("Update things")
            .addNumberOption((b) =>
              b
                .setName("id")
                .setDescription("Todo id")

                .setRequired(true),
            )
            .addStringOption((b) => b.setName("text").setDescription("Todo text").setRequired(true)),
        )
        .addSubcommand((b) =>
          b //
            .setName("clear")
            .setDescription("clear all todo items"),
        ),
    )
  }

  async add(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id
    const text = interaction.options.getString("text", true)
    const item = new TodoItem({ userId, text })
    await item.save()
    return interaction.reply(`Added item: ${item.id}`)
  }

  async list(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id
    const items = await TodoItem.findAll({ where: { userId } })
    return interaction.reply(`Items: \n${items.map((item) => `${item.id}: ${item.text}`).join("\n")}`)
  }

  async doDelete(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id
    const id = interaction.options.getNumber("id", true)
    const item = await TodoItem.findOne({ where: { userId, id } })
    if (!item) return interaction.reply("Item not found")
    const text = item.text
    await item.destroy()

    const thing = await (await interaction.reply("Deleted item: " + text)).fetch()

    await thing.awaitReactions({
      filter,
    })
  }

  async update(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id
    const id = interaction.options.getNumber("id", true)
    const text = interaction.options.getString("text", true)
    const item = await TodoItem.findOne({ where: { userId, id } })
    if (!item) return interaction.reply("Item not found")
    item.text = text
    await item.save()
    return interaction.reply("Updated item")
  }

  async clear(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id
    await TodoItem.destroy({ where: { userId } })
    return interaction.reply("Cleared items")
  }
}
