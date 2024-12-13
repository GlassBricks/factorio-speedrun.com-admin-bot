import { Snowflake } from "discord.js"

export interface Config {
  botName?: string
  voteInitiateCommands?: VoteInitiateCommandConfig[]
  announceCommand?: AnnounceCommandConfig
  autoReact?: AutoReactConfig[]
}

export interface VoteInitiateCommandConfig {
  id: string

  guildIds: Snowflake[]
  idHints: string[] | undefined

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

export interface AnnounceCommandConfig {
  guildIds?: Snowflake[]
  idHints: string[] | undefined

  requiredRoles?: Snowflake[]

  commandName: string
  commandDescription: string
}

const config: Config = ((await import(process.cwd() + "/config.js")) as { default: Config }).default
export default config
