import { Sequelize } from "sequelize-typescript"
import { VoteInitiateMessage } from "./vote-initiate-message.js"

export const sequelize = new Sequelize({
  dialect: "sqlite",
  // storage: dev ? ":memory:" : "database.sqlite",
  storage: "database.sqlite",
  models: [VoteInitiateMessage],
})
