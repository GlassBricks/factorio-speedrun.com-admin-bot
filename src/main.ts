import { GatewayIntentBits } from "discord.js"
import { config } from "dotenv"
import { SapphireClient } from "@sapphire/framework"

config()

const client = new SapphireClient({
  intents: [GatewayIntentBits.MessageContent, GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  loadMessageCommandListeners: true,
})
await client.login(process.env.DISCORD_TOKEN)
