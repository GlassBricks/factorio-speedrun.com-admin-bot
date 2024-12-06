import { Snowflake } from "discord.js"

export interface Config {
  voteInitiateCommands?: VoteInitiateCommandConfig[]
}

export interface VoteInitiateCommandConfig {
  id: string

  guildId: Snowflake

  commandName: string
  commandDescription: string

  confirmationMessage: string

  postChannelId: Snowflake,
  postMessage: string
  postNotifyRoles?: Snowflake[]

  reaction: string
  reactsRequired: number
  durationHours: number

  failedMessage: string

  passedMessage: string
  passedNotifyRoles?: Snowflake[]
}
