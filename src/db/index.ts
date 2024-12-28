import { Column, Index, Model, Sequelize, Table } from "sequelize-typescript"
import { Snowflake } from "discord.js"

// for vote-initiate command
@Table({ paranoid: true })
export class VoteInitiateMessage extends Model {
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
export class KnownFactorioVersion extends Model {
  @Column
  declare stable?: VersionString
  @Column
  declare experimental?: VersionString

  static get(): Promise<KnownFactorioVersion> {
    return KnownFactorioVersion.findOne().then((v) => v ?? new KnownFactorioVersion())
  }
}

// For processing/notifying src submissions
@Table
export class SrcSubmissionProcessing extends Model {
  @Column
  @Index
  declare srcGameId: string

  @Column
  declare lastProcessedTimestamp: Date

  static async getLastProcessedTime(srcGameId: string): Promise<Date> {
    const existing = await SrcSubmissionProcessing.findOne({ where: { srcGameId } })
    if (existing) {
      return existing.lastProcessedTimestamp
    }
    return new Date(0)
  }

  static async saveLastProcessedTime(srcGameId: string, lastProcessedTimestamp: Date): Promise<void> {
    await SrcSubmissionProcessing.upsert({ srcGameId, lastProcessedTimestamp })
  }
}

export const sequelize = new Sequelize({
  dialect: "sqlite",
  // storage: dev ? ":memory:" : "database.sqlite",
  storage: "database.sqlite",
  models: [VoteInitiateMessage, KnownFactorioVersion, SrcSubmissionProcessing],
})
