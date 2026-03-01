import { describe, expect, it, vi } from "vitest"
import { ReplayVerificationStatus } from "../db/replay-verification.js"
import type { RunnerStatusDeps } from "./runner-status.js"

const noop = () => {}
vi.mock("../logger.js", () => ({
  createLogger: () => ({
    debug: noop,
    error: noop,
    info: noop,
    trace: noop,
    warn: noop,
    fatal: noop,
    has: () => false,
    write: noop,
  }),
}))

vi.mock("../db/index.js", () => ({
  ReplayVerification: {},
  ReplayVerificationStatus,
  SrcRun: {},
}))

vi.mock("./announce-src-submissions.js", () => ({
  fetchDiscordMessage: vi.fn(),
}))

const { createRunnerStatusServer } = await import("./runner-status.js")

const AUTH_TOKEN = "test-secret"

function makeDeps(overrides: Partial<RunnerStatusDeps> = {}): RunnerStatusDeps {
  return {
    authToken: AUTH_TOKEN,
    upsertVerification: vi.fn().mockResolvedValue({}),
    enqueueEdit: vi.fn(),
    touchHeartbeat: vi.fn().mockResolvedValue(undefined),
    sweepStale: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

function authHeader(token = AUTH_TOKEN) {
  return { authorization: `Bearer ${token}` }
}

describe("createRunnerStatusServer", () => {
  it("returns 200 and calls upsertVerification with correct args on valid request", async () => {
    const deps = makeDeps()
    const server = createRunnerStatusServer(deps)

    const response = await server.inject({
      method: "POST",
      url: "/api/runs/run-abc/status",
      headers: authHeader(),
      payload: { status: "passed" },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
    expect(deps.upsertVerification).toHaveBeenCalledWith("run-abc", "passed", undefined)
  })

  it("calls enqueueEdit with runId after upsert", async () => {
    const deps = makeDeps()
    const server = createRunnerStatusServer(deps)

    await server.inject({
      method: "POST",
      url: "/api/runs/run-abc/status",
      headers: authHeader(),
      payload: { status: "passed" },
    })

    expect(deps.enqueueEdit).toHaveBeenCalledWith("run-abc")
  })

  it("returns 401 when Authorization header is missing", async () => {
    const server = createRunnerStatusServer(makeDeps())

    const response = await server.inject({
      method: "POST",
      url: "/api/runs/run-abc/status",
      payload: { status: "passed" },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: "Unauthorized" })
  })

  it("returns 401 when bearer token is wrong", async () => {
    const server = createRunnerStatusServer(makeDeps())

    const response = await server.inject({
      method: "POST",
      url: "/api/runs/run-abc/status",
      headers: authHeader("wrong-token"),
      payload: { status: "passed" },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: "Unauthorized" })
  })

  it("returns 400 when status value is invalid", async () => {
    const server = createRunnerStatusServer(makeDeps())

    const response = await server.inject({
      method: "POST",
      url: "/api/runs/run-abc/status",
      headers: authHeader(),
      payload: { status: "bogus" },
    })

    expect(response.statusCode).toBe(400)
  })

  it("passes message field to upsertVerification for error status", async () => {
    const deps = makeDeps()
    const server = createRunnerStatusServer(deps)

    const response = await server.inject({
      method: "POST",
      url: "/api/runs/run-err/status",
      headers: authHeader(),
      payload: { status: "error", message: "timeout" },
    })

    expect(response.statusCode).toBe(200)
    expect(deps.upsertVerification).toHaveBeenCalledWith("run-err", "error", "timeout")
  })

  it("returns 200 on both calls when same runId posted twice with different statuses", async () => {
    const deps = makeDeps()
    const server = createRunnerStatusServer(deps)

    const first = await server.inject({
      method: "POST",
      url: "/api/runs/run-idem/status",
      headers: authHeader(),
      payload: { status: "pending" },
    })
    const second = await server.inject({
      method: "POST",
      url: "/api/runs/run-idem/status",
      headers: authHeader(),
      payload: { status: "passed" },
    })

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(deps.upsertVerification).toHaveBeenCalledTimes(2)
  })
})

describe("heartbeat endpoint", () => {
  it("returns 200 and calls touchHeartbeat with run IDs", async () => {
    const deps = makeDeps()
    const server = createRunnerStatusServer(deps)

    const response = await server.inject({
      method: "POST",
      url: "/api/runs/heartbeat",
      headers: authHeader(),
      payload: { runIds: ["run-1", "run-2"] },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
    expect(deps.touchHeartbeat).toHaveBeenCalledWith(["run-1", "run-2"])
  })

  it("returns 200 with empty array", async () => {
    const deps = makeDeps()
    const server = createRunnerStatusServer(deps)

    const response = await server.inject({
      method: "POST",
      url: "/api/runs/heartbeat",
      headers: authHeader(),
      payload: { runIds: [] },
    })

    expect(response.statusCode).toBe(200)
    expect(deps.touchHeartbeat).toHaveBeenCalledWith([])
  })

  it("returns 401 without auth", async () => {
    const server = createRunnerStatusServer(makeDeps())

    const response = await server.inject({
      method: "POST",
      url: "/api/runs/heartbeat",
      payload: { runIds: ["run-1"] },
    })

    expect(response.statusCode).toBe(401)
  })

  it("does not trigger enqueueEdit", async () => {
    const deps = makeDeps()
    const server = createRunnerStatusServer(deps)

    await server.inject({
      method: "POST",
      url: "/api/runs/heartbeat",
      headers: authHeader(),
      payload: { runIds: ["run-1"] },
    })

    expect(deps.enqueueEdit).not.toHaveBeenCalled()
  })
})
