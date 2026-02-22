import { Client } from "discord.js"
import fastify, { FastifyInstance } from "fastify"
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox"
import { Type } from "@sinclair/typebox"
import { ReplayVerification, ReplayVerificationStatus } from "../db/index.js"
import { SrcRun } from "../db/index.js"
import { RunnerStatusConfig } from "../config-file.js"
import { createLogger } from "../logger.js"
import { container } from "@sapphire/framework"

const logger = createLogger("[RunnerStatus]")

export interface RunnerStatusDeps {
  authToken: string
  upsertVerification: (runId: string, status: ReplayVerificationStatus, message?: string) => Promise<ReplayVerification>
  editRunEmbed: (runId: string) => Promise<void>
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

      void deps.editRunEmbed(runId).catch((err) => logger.warn("Failed to edit run embed:", err))

      return reply.status(200).send({ ok: true })
    },
  )

  return server as unknown as FastifyInstance
}

async function buildEditRunEmbed(runId: string): Promise<void> {
  const srcRun = await SrcRun.findByPk(runId)
  if (!srcRun) {
    logger.debug("No SrcRun found for runId, skipping embed edit:", runId)
    return
  }

  try {
    const channel = await container.client.channels.fetch(srcRun.messageChannelId)
    if (!channel?.isTextBased()) return
    const message = await channel.messages.fetch(srcRun.messageId)
    await message.edit({ embeds: message.embeds })
  } catch (err) {
    logger.warn("Failed to fetch or edit message for run:", runId, err)
  }
}

export async function setUpRunnerStatus(client: Client, config: RunnerStatusConfig | undefined): Promise<void> {
  if (!config) return

  const deps: RunnerStatusDeps = {
    authToken: config.authToken,
    upsertVerification: async (runId, status, message) => {
      const [verification] = await ReplayVerification.upsert({ runId, status, message: message ?? null })
      return verification
    },
    editRunEmbed: buildEditRunEmbed,
  }

  const server = createRunnerStatusServer(deps)

  await server.listen({ port: config.port, host: config.host ?? "0.0.0.0" })
  logger.info(`Runner status server listening on port ${config.port}`)
}
