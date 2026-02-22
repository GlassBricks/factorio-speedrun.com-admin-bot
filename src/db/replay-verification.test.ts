import { Sequelize } from "sequelize-typescript"
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { ReplayVerification, ReplayVerificationStatus } from "./replay-verification.js"

let testSequelize: Sequelize

beforeAll(async () => {
  testSequelize = new Sequelize({
    dialect: "sqlite",
    storage: ":memory:",
    models: [ReplayVerification],
    logging: false,
  })
  await testSequelize.sync()
})

afterAll(async () => {
  await testSequelize.close()
})

describe("ReplayVerification", () => {
  it("upserts correctly: second write updates status and leaves only one row", async () => {
    await ReplayVerification.upsert({ runId: "run-upsert-1", status: ReplayVerificationStatus.Pending, message: null })
    await ReplayVerification.upsert({ runId: "run-upsert-1", status: ReplayVerificationStatus.Passed, message: null })

    const rows = await ReplayVerification.findAll({ where: { runId: "run-upsert-1" } })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe(ReplayVerificationStatus.Passed)
  })

  it.each(Object.values(ReplayVerificationStatus))("stores and retrieves status %s", async (status) => {
    const runId = `run-status-${status}`
    await ReplayVerification.upsert({ runId, status, message: null })

    const row = await ReplayVerification.findByPk(runId)
    expect(row).not.toBeNull()
    expect(row!.status).toBe(status)
  })

  it("stores null message for non-error statuses", async () => {
    await ReplayVerification.upsert({ runId: "run-null-msg", status: ReplayVerificationStatus.Passed, message: null })

    const row = await ReplayVerification.findByPk("run-null-msg")
    expect(row!.message).toBeNull()
  })

  it("stores message for failed status", async () => {
    await ReplayVerification.upsert({
      runId: "run-failed-msg",
      status: ReplayVerificationStatus.Failed,
      message: "checksum mismatch",
    })

    const row = await ReplayVerification.findByPk("run-failed-msg")
    expect(row!.message).toBe("checksum mismatch")
  })

  it("stores message for error status", async () => {
    await ReplayVerification.upsert({
      runId: "run-error-msg",
      status: ReplayVerificationStatus.Error,
      message: "runner crashed",
    })

    const row = await ReplayVerification.findByPk("run-error-msg")
    expect(row!.message).toBe("runner crashed")
  })
})
