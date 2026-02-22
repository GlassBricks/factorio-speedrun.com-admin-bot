import { ReplayVerification } from "../db/replay-verification.js"
import { SrcRun } from "../db/index.js"
import { createLogger } from "../logger.js"
import { formatVerificationStatus, renderEmbed } from "./embed-fields.js"
import { fetchDiscordMessage } from "./announce-src-submissions.js"

const logger = createLogger("[MessageEditActor]")

export class MessageEditActor {
  private pending = new Set<string>()
  private processing = false

  enqueue(runId: string): void {
    this.pending.add(runId)
    void this.drain()
  }

  private async drain(): Promise<void> {
    if (this.processing) return
    this.processing = true
    try {
      while (this.pending.size > 0) {
        const runId = this.pending.values().next().value as string
        this.pending.delete(runId)
        await this.processEdit(runId)
      }
    } finally {
      this.processing = false
    }
  }

  private async processEdit(runId: string): Promise<void> {
    try {
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

      const message = await fetchDiscordMessage(srcRun)
      if (!message) return
      await message.edit({ embeds: [embed] })
    } catch (err) {
      logger.warn("Failed to edit embed for run:", runId, err)
    }
  }
}
