import { Column, Index, Model, PrimaryKey, Sequelize, Table } from "sequelize-typescript"
import { Snowflake } from "discord.js"
import { InferAttributes, InferCreationAttributes } from "sequelize"

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

  static get(): Promise<KnownFactorioVersion> {
    return KnownFactorioVersion.findOne().then((v) => v ?? new KnownFactorioVersion())
  }
}

@Table
export class SrcPlayer extends Model<InferAttributes<SrcPlayer>, InferCreationAttributes<SrcPlayer>> {
  @PrimaryKey
  @Column
  declare userId: string

  @Column({ defaultValue: false })
  declare hasVerifiedRun: boolean
}

export enum SrcRunStatus {
  New = 0,
  Verified = 1,
  Rejected = 2,
  Unknown = 37,
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
  declare messageChannelId?: Snowflake

  @Column
  declare messageId?: Snowflake

  @Column
  declare messageVersion?: number
}

const dev = process.env.NODE_ENV === "development"
export const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: dev ? ":memory:" : "database.sqlite",
  // storage: "database.sqlite",
  models: [VoteInitiateMessage, KnownFactorioVersion, SrcPlayer, SrcRun, AnnounceMessage],
})
