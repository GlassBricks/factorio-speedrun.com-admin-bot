import { Column, Model, Table } from "sequelize-typescript"

export type VersionString = `${bigint}.${bigint}.${bigint}`

/**
 * Represents last known Factorio version.
 */
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
