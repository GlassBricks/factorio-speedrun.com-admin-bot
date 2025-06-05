import { execSync } from "child_process"
import { sequelize } from "./index.js"
import { ILogger } from "@sapphire/framework"

export function checkAndRunMigrations(logger: ILogger): void {
  try {
    // Check if there are pending migrations
    const output = execSync("npm run migrate:status", { encoding: "utf-8" })
    if (output.includes("down")) {
      logger.info("Pending migrations detected. Running migrations...")
      execSync("npm run migrate", { stdio: "inherit" })
      logger.info("Migrations completed successfully")
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("sequelize-cli")) {
      logger.warn('sequelize-cli not found. Skipping migrations. Run "npm install" to install dependencies.')
      return
    }
    logger.error("Failed to check or run migrations:", error)
    throw error
  }
}

export async function syncDatabase(logger: ILogger, force = false): Promise<void> {
  if (process.env.NODE_ENV === "development" && !force) {
    await sequelize.sync()
    logger.info("Database synced (development mode)")
  } else {
    checkAndRunMigrations(logger)
    logger.info("Database migrations checked")
  }
}
