import { Snowflake } from "discord.js"

export interface Config {
  botName?: string
  voteInitiateCommands?: VoteInitiateCommandConfig[]
}

export interface VoteInitiateCommandConfig {
  id: string

  idHints: string[] | undefined
  guildIds: Snowflake[]

  commandName: string
  commandDescription: string

  confirmationMessage: string

  alreadyRunningMessage: string

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
