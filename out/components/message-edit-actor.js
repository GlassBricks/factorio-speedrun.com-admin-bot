import { ReplayVerification } from "../db/replay-verification.js";
import { SrcRun } from "../db/index.js";
import { createLogger } from "../logger.js";
import { renderEmbed, resolveVerificationDisplay } from "./embed-fields.js";
import { fetchDiscordMessage } from "./announce-src-submissions.js";
const logger = createLogger("[MessageEditActor]");
export class MessageEditActor {
    pending = new Set();
    processing = false;
    enqueue(runId) {
        this.pending.add(runId);
        void this.drain();
    }
    async drain() {
        if (this.processing)
            return;
        this.processing = true;
        try {
            while (this.pending.size > 0) {
                const runId = this.pending.values().next().value;
                this.pending.delete(runId);
                await this.processEdit(runId);
            }
        }
        finally {
            this.processing = false;
        }
    }
    async processEdit(runId) {
        try {
            const srcRun = await SrcRun.findByPk(runId);
            if (!srcRun?.runData) {
                logger.debug("No SrcRun or runData found for runId, skipping embed edit:", runId);
                return;
            }
            const verification = await ReplayVerification.findByPk(runId);
            const embed = renderEmbed({
                runData: srcRun.runData,
                runId: srcRun.runId,
                submissionTime: srcRun.submissionTime,
                lastStatus: srcRun.lastStatus,
                videoProof: srcRun.videoProofText ?? "None found",
                statusText: srcRun.statusText ?? "⏳ new",
                replayVerification: resolveVerificationDisplay(verification),
            });
            const message = await fetchDiscordMessage(srcRun);
            if (!message)
                return;
            await message.edit({ embeds: [embed] });
        }
        catch (err) {
            logger.warn("Failed to edit embed for run:", runId, err);
        }
    }
}
//# sourceMappingURL=message-edit-actor.js.map