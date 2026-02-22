import { Snowflake } from "discord.js"
import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes } from "sequelize"
import { Column, CreatedAt, Index, Model, PrimaryKey, Sequelize, Table } from "sequelize-typescript"
import { ReplayVerification } from "./replay-verification.js"
import { RunData, SrcRunStatus } from "./run-data.js"
export { ReplayVerification, ReplayVerificationStatus } from "./replay-verification.js"
export { SrcRunStatus, type RunData } from "./run-data.js"

// for vote-initiate command
@Table({ paranoid: true })
export class VoteInitiateMessage extends Model<
  InferAttributes<VoteInitiateMessage>,
  InferCreationAttributes<VoteInitiateMessage>
> {
  // only one per command at a time
  @Column
  @Index
  declare commandId: string
  @Column
  declare guildId: Snowflake
  @Column
  declare postChannelId: Snowflake
  @Column
  declare postMessageId: Snowflake
}

export type VersionString = `${bigint}.${bigint}.${bigint}`

// for notifying new factorio versions
@Table
export class KnownFactorioVersion extends Model<
  InferAttributes<KnownFactorioVersion>,
  InferCreationAttributes<KnownFactorioVersion>
> {
  @Column
  declare stable?: VersionString
  @Column
  declare experimental?: VersionString

  static async get(): Promise<KnownFactorioVersion> {
    return (await KnownFactorioVersion.findOne()) ?? new KnownFactorioVersion()
  }
}

@Table
export class AnnounceMessage extends Model<InferAttributes<AnnounceMessage>, InferCreationAttributes<AnnounceMessage>> {
  @PrimaryKey
  @Column
  declare srcMessageId: Snowflake

  @Column
  declare dstMessageId: Snowflake

  @Column
  declare dstChannelId: Snowflake
}

@Table
export class SrcRun extends Model<InferAttributes<SrcRun>, InferCreationAttributes<SrcRun>> {
  @PrimaryKey
  @Column
  declare runId: string

  @Index
  @Column
  declare lastStatus: SrcRunStatus

  @Index({ order: "DESC" })
  @Column
  declare submissionTime: Date

  @Column
  declare messageChannelId: CreationOptional<Snowflake | null>

  @Column
  declare messageId: CreationOptional<Snowflake | null>

  @Column
  declare messageVersion: number

  @Column
  declare videoProof?: string

  @Column
  declare videoProofText: CreationOptional<string | null>

  @Column
  declare statusText: CreationOptional<string | null>

  @Column(DataTypes.JSON)
  declare runData: CreationOptional<RunData | null>

  @Column
  declare newPlayerAnnounceChecked: boolean
}

@Table
export class MessageReport extends Model<InferAttributes<MessageReport>, InferCreationAttributes<MessageReport>> {
  @PrimaryKey
  @Index
  @Column
  declare messageId: Snowflake

  @PrimaryKey
  @Index
  @Column
  declare reporterId: Snowflake

  @PrimaryKey
  @Index
  @Column
  declare authorId: Snowflake

  @Column
  declare messageUrl: string

  @Column
  declare reason?: string

  @CreatedAt
  @Index
  declare createdAt: CreationOptional<Date>
}

@Table
export class DiscussionBan extends Model<InferAttributes<DiscussionBan>, InferCreationAttributes<DiscussionBan>> {
  @PrimaryKey
  @Column
  declare guildId: Snowflake

  @PrimaryKey
  @Column
  declare userId: Snowflake

  @Column
  declare bannedAt: Date

  @Column
  declare expiresAt: Date

  @Column
  declare reason?: string
}

const dev = process.env.NODE_ENV === "development"
export const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: dev ? ":memory:" : "database.sqlite",
  // storage: "database.sqlite",
  models: [
    VoteInitiateMessage,
    KnownFactorioVersion,
    SrcRun,
    AnnounceMessage,
    MessageReport,
    DiscussionBan,
    ReplayVerification,
  ],
})
