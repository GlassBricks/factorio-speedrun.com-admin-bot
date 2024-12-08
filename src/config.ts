import { Snowflake } from "discord.js"

export interface Config {
  botName?: string
  voteInitiateCommands?: VoteInitiateCommandConfig[]
  autoReact?: AutoReactConfig[]
}

export interface VoteInitiateCommandConfig {
  id: string

  idHints: string[] | undefined
  guildIds: Snowflake[]

  commandName: string
  commandDescription: string

  confirmationMessage: string

  alreadyRunningMessage: string

  postChannelId: Snowflake
  postMessage: string
  postNotifyRoles?: Snowflake[]

  reaction: string
  reactsRequired: number
  durationHours: number

  failedMessage: string

  passedMessage: string
  passedNotifyRoles?: Snowflake[]
}

export interface AutoReactConfig {
  onBotMention: boolean
  users?: Snowflake[]
  channels?: Snowflake[]
  regex: string
  reactions: string[]
}

const config: Config = ((await import(process.cwd() + "/config.js")) as { default: Config }).default
export default config
