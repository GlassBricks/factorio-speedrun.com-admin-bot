import { Column, CreatedAt, Model, PrimaryKey, Table, UpdatedAt } from "sequelize-typescript"
import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes } from "sequelize"

export enum ReplayVerificationStatus {
  Pending = "pending",
  Running = "running",
  Passed = "passed",
  NeedsReview = "needs_review",
  Failed = "failed",
  Error = "error",
}

@Table
export class ReplayVerification extends Model<
  InferAttributes<ReplayVerification>,
  InferCreationAttributes<ReplayVerification>
> {
  @PrimaryKey
  @Column
  declare runId: string

  @Column
  declare status: ReplayVerificationStatus

  @Column(DataTypes.TEXT)
  declare message: CreationOptional<string | null>

  @CreatedAt
  declare createdAt: CreationOptional<Date>

  @UpdatedAt
  declare updatedAt: CreationOptional<Date>
}
