import { MessageMentionOptions, Snowflake } from "discord.js"

export interface Config {
  botName?: string
  messageRelay?: MessageRelayConfig[]
  announcementRelay?: AnnouncementRelayConfig[]
  voteInitiateCommands?: VoteInitiateCommandConfig[]
  announceNewFactorioVersion?: AnnounceFactorioVersionConfig
  autoReact?: AutoReactConfig[]
  announceSrcSubmissions?: AnnounceSrcSubmissionsConfig
  discussionModeration?: DiscussionModerationConfig
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

export interface AnnouncementRelayConfig {
  fromChannelId: Snowflake
  toChannelId: Snowflake
  confirmReact: string
}

export interface AnnounceFactorioVersionConfig {
  channelId: Snowflake
  cronSchedule: string
}

export interface AnnounceSrcSubmissionsConfig {
  channelId: Snowflake
  games: { id: string }[]
  cronSchedule: string
  announceNewPlayersMessage?: {
    message: string
    allowedMentions?: MessageMentionOptions
  }
}

export interface AutoReactConfig {
  onBotMention: boolean
  users?: Snowflake[]
  channels?: Snowflake[]
  regex: string
  reactions: string[]
}

export interface DiscussionModerationConfig {
  logChannelId: Snowflake

  acceptRequiredRoles: Snowflake[]
  acceptChannel?: Snowflake
  grantRoleId: Snowflake

  reportRequiredRoles?: Snowflake[]
  reportableChannels: Snowflake[]
  reportsTempBanThreshold: number

  tempBanDays: number
  tempBanNotify?: Snowflake[]
}

const dev = process.env.NODE_ENV === "development"
const configFile = dev ? "config.dev.js" : "config.js"

const config: Config = (await import(process.cwd() + "/" + configFile)).default as Config
export default config
