import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox"
import { Type } from "@sinclair/typebox"
import { Client } from "discord.js"
import fastify, { FastifyInstance } from "fastify"
import { RunnerStatusServerConfig } from "../config-file.js"
import { ReplayVerification, ReplayVerificationStatus } from "../db/index.js"
import { createLogger } from "../logger.js"
import type { MessageEditActor } from "./message-edit-actor.js"

const logger = createLogger("[RunnerStatus]")

export interface RunnerStatusDeps {
  authToken: string
  upsertVerification: (runId: string, status: ReplayVerificationStatus, message?: string) => Promise<ReplayVerification>
  enqueueEdit: (runId: string) => void
}

const RunStatusBody = Type.Object({
  status: Type.Enum(ReplayVerificationStatus),
  message: Type.Optional(Type.String()),
})

const RunIdParams = Type.Object({
  runId: Type.String({ minLength: 1 }),
})

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
    {
      schema: {
        body: RunStatusBody,
        params: RunIdParams,
      },
    },
    async (request, reply) => {
      const { runId } = request.params
      const { status, message } = request.body

      await deps.upsertVerification(runId, status, message)
      deps.enqueueEdit(runId)

      return reply.status(200).send({ ok: true })
    },
  )

  return server
}

export async function setUpRunnerStatus(
  _client: Client,
  config: RunnerStatusServerConfig | undefined,
  actor: MessageEditActor,
): Promise<void> {
  if (!config) return

  const deps: RunnerStatusDeps = {
    authToken: config.authToken,
    upsertVerification: async (runId, status, message) => {
      const [verification] = await ReplayVerification.upsert({ runId, status, message: message ?? null })
      return verification
    },
    enqueueEdit: (runId) => actor.enqueue(runId),
  }

  const server = createRunnerStatusServer(deps)

  await server.listen({ port: config.port, host: config.host ?? "0.0.0.0" })
  logger.info(`Runner status server listening on port ${config.port}`)
}
