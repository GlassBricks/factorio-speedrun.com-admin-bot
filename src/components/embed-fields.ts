import { APIEmbedField, EmbedBuilder, HexColorString } from "discord.js"
import { ReplayVerificationStatus } from "../db/replay-verification.js"
import { SrcRunStatus } from "../db/run-data.js"
import type { RunData } from "../db/run-data.js"

const ordinalSuffixes = ["th", "st", "nd", "rd"]

function formatPlace(place: number): string {
  const mod100 = place % 100
  const mod10 = place % 10
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : (ordinalSuffixes[mod10] ?? "th")
  return `${place}${suffix}`
}

function getPlaceText(place: number | null) {
  return place === null
    ? "Unknown"
    : place === 1
      ? "🥇 A New World Record"
      : place === 2
        ? "🥈"
        : place === 3
          ? "🥉"
          : formatPlace(place)
}

export function formatVerificationStatus(status: ReplayVerificationStatus, message?: string | null): string {
  switch (status) {
    case ReplayVerificationStatus.Pending:
      return "⏳ Pending"
    case ReplayVerificationStatus.Running:
      return "🔄 Running"
    case ReplayVerificationStatus.Passed:
      return "✅ Passed"
    case ReplayVerificationStatus.NeedsReview:
      return "⚠️ Needs review"
    case ReplayVerificationStatus.Failed:
      return "❌ Failed"
    case ReplayVerificationStatus.Error:
      return message ? `💥 Error: ${message}` : "💥 Error"
  }
}

export function statusColor(status: SrcRunStatus): HexColorString {
  switch (status) {
    case SrcRunStatus.New:
      return "#ffee20"
    case SrcRunStatus.Verified:
      return "#20ff20"
    case SrcRunStatus.SelfVerified:
      return "#75ff94"
    case SrcRunStatus.Rejected:
      return "#ff5050"
    case SrcRunStatus.Unknown:
      return "#ffee20"
  }
}

export interface RenderEmbedInput {
  runData: RunData
  runId: string
  submissionTime: Date
  lastStatus: SrcRunStatus
  videoProof: string
  statusText: string
  replayVerification: string | null
}

export function renderEmbed(input: RenderEmbedInput): EmbedBuilder {
  const { runData, runId, submissionTime, lastStatus, videoProof, statusText, replayVerification } = input

  const playersStr =
    runData.players.length <= 4
      ? runData.players.join(", ")
      : runData.players.slice(0, 3).join(", ") + `, and ${runData.players.length - 3} more`

  const weblink = `https://www.speedrun.com/run/${runId}`
  const description = `## ${runData.gameName} | [${runData.categoryName} by ${playersStr} in ${runData.time}](${weblink})`

  const fields: APIEmbedField[] = []

  if (runData.firstTimeSubmissionPlayers.length > 0) {
    fields.push({
      name: "🎉 First time submission",
      value: runData.firstTimeSubmissionPlayers.join(", "),
      inline: true,
    })
  }

  if (runData.isChallengerRun && runData.place !== undefined) {
    fields.push({
      name: "🏆 Challenger run",
      value: `May be ${getPlaceText(runData.place)}!`,
      inline: true,
    })
  } else if (runData.place !== undefined) {
    fields.push({
      name: "Place",
      value: getPlaceText(runData.place),
      inline: true,
    })
  }

  if (videoProof) {
    fields.push({ name: "Video proof", value: videoProof, inline: false })
  }

  if (statusText) {
    fields.push({ name: "Status", value: statusText, inline: true })
  }

  if (replayVerification) {
    fields.push({ name: "Replay verification", value: replayVerification, inline: true })
  }

  return new EmbedBuilder()
    .setTitle("Run submission")
    .setDescription(description)
    .setThumbnail(`https://www.speedrun.com/static/game/${runData.gameId}/cover.png`)
    .setTimestamp(submissionTime)
    .setColor(statusColor(lastStatus))
    .setFields(fields)
}
