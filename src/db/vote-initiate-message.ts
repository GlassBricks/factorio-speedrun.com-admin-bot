import { Column, Index, Model, Table } from "sequelize-typescript"
import { Snowflake } from "discord.js"

@Table({
  paranoid: true
})
export class VoteInitiateMessage extends Model {
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
