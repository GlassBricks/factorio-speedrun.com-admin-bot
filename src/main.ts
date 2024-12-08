import { Events, GatewayIntentBits, Partials } from "discord.js"
import { config } from "dotenv"
import { LogLevel, SapphireClient } from "@sapphire/framework"
import { sequelize } from "./db/index.js"

import "@sapphire/plugin-subcommands/register"
import { setUpVoteInitiateCommand } from "./vote-initiate.js"
import type { Config } from "./config.js"

config()

const dev = process.env.NODE_ENV === "development"

const client = new SapphireClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.User, Partials.Reaction],
  loadDefaultErrorListeners: true,
  loadMessageCommandListeners: true,
  logger: {
    level: dev ? LogLevel.Debug : LogLevel.Info,
  },
})

const configPath = process.cwd() + "/config.js"
const theConfig: Config = ((await import(configPath)) as { default: Config }).default

if (theConfig.botName) {
  client.once(Events.ClientReady, (client) => {
    client.logger.info("Bot is ready")
    void client.user.setUsername(theConfig.botName!)
  })
}

setUpVoteInitiateCommand(client, theConfig.voteInitiateCommands)

await sequelize.sync()
client.logger.info("Database synced")
await client.login(process.env.DISCORD_TOKEN)
