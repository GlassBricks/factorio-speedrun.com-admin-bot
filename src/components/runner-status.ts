import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox"
import { Type } from "@sinclair/typebox"
import { Client } from "discord.js"
import fastify, { FastifyInstance } from "fastify"
import { Op } from "sequelize"
import { RunnerStatusServerConfig } from "../config-file.js"
import { ReplayVerification, ReplayVerificationStatus } from "../db/index.js"
import { createLogger } from "../logger.js"
import { STALENESS_THRESHOLD_MS } from "./embed-fields.js"
import type { MessageEditActor } from "./message-edit-actor.js"

const logger = createLogger("[RunnerStatus]")

const STALENESS_SWEEP_INTERVAL_MS = 10 * 60 * 1000
const NON_FINAL_STATUSES = [ReplayVerificationStatus.Pending, ReplayVerificationStatus.Running]

export interface RunnerStatusDeps {
  authToken: string
  upsertVerification: (runId: string, status: ReplayVerificationStatus, message?: string) => Promise<ReplayVerification>
  destroyVerification: (runId: string) => Promise<void>
  enqueueEdit: (runId: string) => void
  touchHeartbeat: (runIds: string[]) => Promise<void>
}

const RunStatusBody = Type.Object({
  status: Type.Enum(ReplayVerificationStatus),
  message: Type.Optional(Type.String()),
})

const RunIdParams = Type.Object({
  runId: Type.String({ minLength: 1 }),
})

const BulkStatusBody = Type.Object({
  runs: Type.Array(
    Type.Object({
      runId: Type.String({ minLength: 1 }),
      status: Type.Enum(ReplayVerificationStatus),
      message: Type.Optional(Type.String()),
    }),
  ),
})

const HeartbeatBody = Type.Object({
  runIds: Type.Array(Type.String({ minLength: 1 })),
})

async function sweepStaleVerifications(): Promise<string[]> {
  const cutoff = new Date(Date.now() - STALENESS_THRESHOLD_MS)
  const staleRecords = await ReplayVerification.findAll({
    where: { status: NON_FINAL_STATUSES, updatedAt: { [Op.lt]: cutoff } },
    attributes: ["runId"],
  })
  const staleRunIds = staleRecords.map((r) => r.runId)
  if (staleRunIds.length > 0) {
    await ReplayVerification.destroy({ where: { runId: staleRunIds } })
  }
  return staleRunIds
}

export function createRunnerStatusServer(deps: RunnerStatusDeps): FastifyInstance {
  const server = fastify().withTypeProvider<TypeBoxTypeProvider>()

  server.addHook("onRequest", async (request, reply) => {
    const authHeader = request.headers.authorization
    if (authHeader !== `Bearer ${deps.authToken}`) {
      await reply.status(401).send({ error: "Unauthorized" })
    }
  })

  server.post(
    "/api/runs/:runId/status",
    { schema: { body: RunStatusBody, params: RunIdParams } },
    async (request, reply) => {
      const { runId } = request.params
      const { status, message } = request.body

      await deps.upsertVerification(runId, status, message)
      deps.enqueueEdit(runId)

      return reply.status(200).send({ ok: true })
    },
  )

  server.delete("/api/runs/:runId/status", { schema: { params: RunIdParams } }, async (request, reply) => {
    const { runId } = request.params
    await deps.destroyVerification(runId)
    deps.enqueueEdit(runId)
    return reply.status(200).send({ ok: true })
  })

  server.post("/api/runs/status", { schema: { body: BulkStatusBody } }, async (request, reply) => {
    for (const run of request.body.runs) {
      await deps.upsertVerification(run.runId, run.status, run.message)
      deps.enqueueEdit(run.runId)
    }
    return reply.status(200).send({ ok: true })
  })

  server.post("/api/runs/heartbeat", { schema: { body: HeartbeatBody } }, async (request, reply) => {
    await deps.touchHeartbeat(request.body.runIds)
    return reply.status(200).send({ ok: true })
  })

  return server
}

export async function setUpRunnerStatus(
  _client: Client,
  config: RunnerStatusServerConfig | undefined,
  actor: MessageEditActor,
): Promise<void> {
  if (!config) return

  const authToken = process.env.RUNNER_STATUS_AUTH_TOKEN
  if (!authToken) throw new Error("RUNNER_STATUS_AUTH_TOKEN env var is required when runnerStatus is configured")

  const deps: RunnerStatusDeps = {
    authToken,
    upsertVerification: async (runId, status, message) => {
      const [verification] = await ReplayVerification.upsert({ runId, status, message: message ?? null })
      return verification
    },
    destroyVerification: async (runId) => {
      await ReplayVerification.destroy({ where: { runId } })
    },
    enqueueEdit: (runId) => actor.enqueue(runId),
    touchHeartbeat: async (runIds) => {
      if (runIds.length === 0) return
      await ReplayVerification.update(
        { updatedAt: new Date() },
        { where: { runId: runIds, status: NON_FINAL_STATUSES }, silent: true },
      )
    },
  }

  const server = createRunnerStatusServer(deps)

  setInterval(() => {
    void sweepStaleVerifications()
      .then((staleRunIds) => {
        for (const runId of staleRunIds) {
          actor.enqueue(runId)
        }
        if (staleRunIds.length > 0) {
          logger.info(`Swept ${staleRunIds.length} stale verification records`)
        }
      })
      .catch((err) => {
        logger.warn("Staleness sweep failed:", err)
      })
  }, STALENESS_SWEEP_INTERVAL_MS)

  await server.listen({ port: config.port, host: config.host ?? "0.0.0.0" })
  logger.info(`Runner status server listening on port ${config.port}`)
}
