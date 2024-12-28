import { Events, GatewayIntentBits, Partials } from "discord.js"
import { config as dotEnvConfig } from "dotenv"
import { LogLevel, SapphireClient } from "@sapphire/framework"
import { sequelize } from "./db/index.js"

import config from "./config.js"
import { setUpVoteInitiateCommand } from "./other-components/vote-initiate.js"
import { setUpAnnounceFactorioVersion } from "./other-components/announce-factorio-version.js"

dotEnvConfig()

const dev = process.env.NODE_ENV === "development"

const client = new SapphireClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.User, Partials.Reaction, Partials.Channel],
  loadDefaultErrorListeners: true,
  loadMessageCommandListeners: true,
  logger: {
    level: dev ? LogLevel.Debug : LogLevel.Info,
  },
})

if (config.botName) {
  client.once(Events.ClientReady, (client) => {
    client.logger.info("Bot is ready")
    client.user.setUsername(config.botName!).catch((error) => client.logger.error("Failed to set bot name", error))
  })
}

setUpVoteInitiateCommand(client, config.voteInitiateCommands)
setUpAnnounceFactorioVersion(client, config.announceNewFactorioVersion)

await sequelize.sync()
client.logger.info("Database synced")
await client.login(process.env.DISCORD_TOKEN)
