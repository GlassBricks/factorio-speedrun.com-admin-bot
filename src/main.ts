import { GatewayIntentBits } from "discord.js"
import { config } from "dotenv"
import { LogLevel, SapphireClient } from "@sapphire/framework"
import { sequelize } from "./db.js"

import "@sapphire/plugin-subcommands/register"

config()

const dev = process.env.NODE_ENV === "development"

const client = new SapphireClient({
  intents: [GatewayIntentBits.MessageContent, GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  loadMessageCommandListeners: true,
  loadDefaultErrorListeners: true,
  logger: {
    level: dev ? LogLevel.Debug : LogLevel.Info,
  },
})

await sequelize.sync()

await client.login(process.env.DISCORD_TOKEN)
