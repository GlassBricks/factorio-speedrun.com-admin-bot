import { APIEmbedField, HexColorString } from "discord.js"
import { ReplayVerificationStatus } from "../db/replay-verification.js"

const ordinalSuffixes = ["th", "st", "nd", "rd"]

function formatPlace(place: number): string {
  const mod100 = place % 100
  const mod10 = place % 10
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : (ordinalSuffixes[mod10] ?? "th")
  return `${place}${suffix}`
}

export interface RunMessageParts {
  title: string
  description: string
  thumbnail: string
  timestamp: Date
  color: HexColorString

  firstTimeSubmissionPlayers: string[]
  isChallengerRun: boolean
  place: number | undefined
  videoProof: string
  status: string
  replayVerification?: string
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

export function getEmbedFields(parts: Partial<RunMessageParts>, fromExisting?: APIEmbedField[]): APIEmbedField[] {
  function field(
    name: string,
    keys: (keyof RunMessageParts)[],
    valueFromParts: string | false | undefined,
    inline: boolean = false,
  ): APIEmbedField | undefined {
    if (!keys.every((k) => k in parts)) {
      return fromExisting?.find((x) => x.name === name)
    } else if (!valueFromParts) {
      return undefined
    } else
      return {
        name,
        value: valueFromParts,
        inline,
      }
  }

  return [
    field(
      "🎉 First time submission",
      ["firstTimeSubmissionPlayers"],
      parts.firstTimeSubmissionPlayers?.join(", "),
      true,
    ),
    field(
      "🏆 Challenger run",
      ["isChallengerRun", "place"],
      parts.isChallengerRun && parts.place !== undefined && `May be ${getPlaceText(parts.place)}!`,
      true,
    ),
    field(
      "Place",
      ["place", "isChallengerRun"],
      !parts.isChallengerRun && parts.place !== undefined && getPlaceText(parts.place),
      true,
    ),
    field("Video proof", ["videoProof"], parts.videoProof),
    field("Status", ["status"], parts.status, true),
    field("Replay verification", ["replayVerification"], parts.replayVerification, true),
  ].filter((x): x is APIEmbedField => !!x)
}
