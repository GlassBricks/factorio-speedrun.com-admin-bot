import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox"
import { Type } from "@sinclair/typebox"
import { Client } from "discord.js"
import fastify, { FastifyInstance } from "fastify"
import { RunnerStatusServerConfig } from "../config-file.js"
import { ReplayVerification, ReplayVerificationStatus, SrcRun } from "../db/index.js"
import { createLogger } from "../logger.js"
import { formatVerificationStatus, renderEmbed } from "./embed-fields.js"
import { fetchDiscordMessage } from "./announce-src-submissions.js"

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

  return server
}

async function buildEditRunEmbed(runId: string): Promise<void> {
  const srcRun = await SrcRun.findByPk(runId)
  if (!srcRun?.runData) {
    logger.debug("No SrcRun or runData found for runId, skipping embed edit:", runId)
    return
  }

  const verification = await ReplayVerification.findByPk(runId)
  const embed = renderEmbed({
    runData: srcRun.runData,
    runId: srcRun.runId,
    submissionTime: srcRun.submissionTime,
    lastStatus: srcRun.lastStatus,
    videoProof: srcRun.videoProofText ?? "None found",
    statusText: srcRun.statusText ?? "⏳ new",
    replayVerification: verification ? formatVerificationStatus(verification.status, verification.message) : null,
  })

  try {
    const message = await fetchDiscordMessage(srcRun)
    if (!message) return
    await message.edit({ embeds: [embed] })
  } catch (err) {
    logger.warn("Failed to fetch or edit message for run:", runId, err)
  }
}

export async function setUpRunnerStatus(_client: Client, config: RunnerStatusServerConfig | undefined): Promise<void> {
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
