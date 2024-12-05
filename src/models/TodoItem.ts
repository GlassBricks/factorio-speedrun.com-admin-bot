import { Column, Index, Model, Table } from "sequelize-typescript"
import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes } from "sequelize"
import { sequelize } from "../db.js"

@Table
export class TodoItem extends Model<InferAttributes<TodoItem>, InferCreationAttributes<TodoItem>> {
  @Column({
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  declare id: CreationOptional<number>

  @Index
  @Column
  declare userId: string

  @Column
  declare text: string
}
sequelize.addModels([TodoItem])
