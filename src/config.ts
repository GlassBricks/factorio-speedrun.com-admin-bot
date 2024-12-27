import { Snowflake } from "discord.js"

export interface Config {
  botName?: string
  announceCommand?: AnnounceCommandConfig
  voteInitiateCommands?: VoteInitiateCommandConfig[]
  autoReact?: AutoReactConfig[]
  messageRelay?: MessageRelayConfig[]
}

export interface AnnounceCommandConfig {
  guildIds?: Snowflake[]

  announceToCommandName: string
  announceToDescription: string
  announceToIdHint: string[] | undefined
  announceCommandName: string
  announceDescription: string
  announceIdHint: string[] | undefined

  requiredRoles?: Snowflake[]
  announceChannelId: Snowflake
  auditLogChannelId: Snowflake
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

export interface MessageRelayConfig {
  fromChannelId: Snowflake
  toChannelId: Snowflake
  dmMessage?: string
  relayMessage: string
}

const config: Config = ((await import(process.cwd() + "/config.js")) as { default: Config }).default
export default config
