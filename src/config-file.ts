import { Snowflake } from "discord.js"

export interface Config {
  botName?: string
  announceCommand?: AnnounceCommandConfig
  voteInitiateCommands?: VoteInitiateCommandConfig[]
  messageRelay?: MessageRelayConfig[]
  announceNewFactorioVersion?: AnnounceFactorioVersionConfig
  autoReact?: AutoReactConfig[]
  announceSrcSubmissions?: AnnounceSrcSubmissionsConfig
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

export interface MessageRelayConfig {
  fromChannelId: Snowflake
  toChannelId: Snowflake
  dmMessage?: string
  relayMessage: string
}

export interface AnnounceFactorioVersionConfig {
  channelId: Snowflake
  cronSchedule: string
}

export interface AnnounceSrcSubmissionsConfig {
  channelId: Snowflake
  games: {
    id: string
    nickname?: string
  }[]
  cronSchedule: string
  announceNewPlayersMessage?: string
}

export interface AutoReactConfig {
  onBotMention: boolean
  users?: Snowflake[]
  channels?: Snowflake[]
  regex: string
  reactions: string[]
}

const dev = process.env.NODE_ENV === "development"
const configFile = dev ? "config.dev.js" : "config.js"

const config: Config = (await import(process.cwd() + "/" + configFile)).default as Config
export default config
