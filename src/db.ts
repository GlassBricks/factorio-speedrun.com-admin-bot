import { ModelCtor, Sequelize } from "sequelize-typescript"

export const sequelize = new Sequelize({
  dialect: "sqlite",
  // storage: dev ? ":memory:" : "database.sqlite",
  storage: "database.sqlite",
})

export function AddModel(model: ModelCtor) {
  sequelize.addModels([model])
}
