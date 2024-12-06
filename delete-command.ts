import { config } from "dotenv"
import { REST, Routes } from "discord.js"

config()
const token = process.env.DISCORD_TOKEN!
const clientId = process.env.CLIENT_ID!
const rest = new REST().setToken(token)

const guildId = process.argv[2]!
const commandId = process.argv[3]!
console.log(`Deleting command ${commandId} from guild ${guildId}`)

await rest.delete(Routes.applicationCommand(clientId, commandId))
