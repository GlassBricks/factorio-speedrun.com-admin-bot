import { describe, expect, it } from "vitest"
import { ReplayVerificationStatus } from "../db/replay-verification.js"
import type { RunData } from "../db/run-data.js"
import { SrcRunStatus } from "../db/run-data.js"
import { formatVerificationStatus, renderEmbed, RenderEmbedInput } from "./embed-fields.js"

describe("formatVerificationStatus", () => {
  it("maps pending to correct emoji and text", () => {
    expect(formatVerificationStatus(ReplayVerificationStatus.Pending)).toBe("⏳ Pending")
  })

  it("maps running to correct emoji and text", () => {
    expect(formatVerificationStatus(ReplayVerificationStatus.Running)).toBe("🔄 Running")
  })

  it("maps passed to correct emoji and text", () => {
    expect(formatVerificationStatus(ReplayVerificationStatus.Passed)).toBe("✅ Passed")
  })

  it("maps needs_review to correct emoji and text", () => {
    expect(formatVerificationStatus(ReplayVerificationStatus.NeedsReview)).toBe("⚠️ Needs review")
  })

  it("maps failed to correct emoji and text", () => {
    expect(formatVerificationStatus(ReplayVerificationStatus.Failed)).toBe("❌ Failed")
  })

  it("maps error without message to just error text", () => {
    expect(formatVerificationStatus(ReplayVerificationStatus.Error)).toBe("💥 Error")
  })

  it("maps error with message to error text with message appended", () => {
    expect(formatVerificationStatus(ReplayVerificationStatus.Error, "save file corrupt")).toBe(
      "💥 Error: save file corrupt",
    )
  })

  it("maps error with null message to just error text", () => {
    expect(formatVerificationStatus(ReplayVerificationStatus.Error, null)).toBe("💥 Error")
  })
})

function makeRunData(overrides: Partial<RunData> = {}): RunData {
  return {
    gameId: "game123",
    gameName: "Factorio",
    categoryName: "Any%",
    players: ["Player1"],
    time: "1:23:45",
    place: 5,
    isChallengerRun: false,
    firstTimeSubmissionPlayers: [],
    ...overrides,
  }
}

function makeInput(overrides: Partial<RenderEmbedInput> = {}): RenderEmbedInput {
  return {
    runData: makeRunData(),
    runId: "run-abc",
    submissionTime: new Date("2025-01-01T00:00:00Z"),
    lastStatus: SrcRunStatus.New,
    videoProof: "[YouTube video](https://youtu.be/abc)",
    statusText: "⏳ new",
    replayVerification: null,
    ...overrides,
  }
}

describe("renderEmbed", () => {
  it("sets title to 'Run submission'", () => {
    const embed = renderEmbed(makeInput()).toJSON()
    expect(embed.title).toBe("Run submission")
  })

  it("includes game name, category, players, and time in description", () => {
    const embed = renderEmbed(makeInput()).toJSON()
    expect(embed.description).toContain("Factorio")
    expect(embed.description).toContain("Any%")
    expect(embed.description).toContain("Player1")
    expect(embed.description).toContain("1:23:45")
  })

  it("includes weblink in description", () => {
    const embed = renderEmbed(makeInput()).toJSON()
    expect(embed.description).toContain("https://www.speedrun.com/run/run-abc")
  })

  it("sets thumbnail to game cover image", () => {
    const embed = renderEmbed(makeInput()).toJSON()
    expect(embed.thumbnail?.url).toBe("https://www.speedrun.com/static/game/game123/cover.png")
  })

  it("truncates player list when more than 4 players", () => {
    const runData = makeRunData({ players: ["A", "B", "C", "D", "E"] })
    const embed = renderEmbed(makeInput({ runData })).toJSON()
    expect(embed.description).toContain("A, B, C, and 2 more")
  })

  it("omits first time submission field when no new players", () => {
    const embed = renderEmbed(makeInput()).toJSON()
    expect(embed.fields?.find((f) => f.name === "🎉 First time submission")).toBeUndefined()
  })

  it("includes first time submission field when new players exist", () => {
    const runData = makeRunData({ firstTimeSubmissionPlayers: ["NewGuy", "AnotherNew"] })
    const embed = renderEmbed(makeInput({ runData })).toJSON()
    const field = embed.fields?.find((f) => f.name === "🎉 First time submission")
    expect(field?.value).toBe("NewGuy, AnotherNew")
    expect(field?.inline).toBe(true)
  })

  it("shows challenger run field for top 3 challenger runs", () => {
    const runData = makeRunData({ isChallengerRun: true, place: 1 })
    const embed = renderEmbed(makeInput({ runData })).toJSON()
    const field = embed.fields?.find((f) => f.name === "🏆 Challenger run")
    expect(field?.value).toContain("🥇 A New World Record")
    expect(embed.fields?.find((f) => f.name === "Place")).toBeUndefined()
  })

  it("shows place field for non-challenger runs", () => {
    const runData = makeRunData({ isChallengerRun: false, place: 5 })
    const embed = renderEmbed(makeInput({ runData })).toJSON()
    const field = embed.fields?.find((f) => f.name === "Place")
    expect(field?.value).toBe("5th")
    expect(embed.fields?.find((f) => f.name === "🏆 Challenger run")).toBeUndefined()
  })

  it("includes video proof field", () => {
    const embed = renderEmbed(makeInput()).toJSON()
    const field = embed.fields?.find((f) => f.name === "Video proof")
    expect(field?.value).toBe("[YouTube video](https://youtu.be/abc)")
  })

  it("includes status field", () => {
    const embed = renderEmbed(makeInput()).toJSON()
    const field = embed.fields?.find((f) => f.name === "Status")
    expect(field?.value).toBe("⏳ new")
    expect(field?.inline).toBe(true)
  })

  it("omits replay verification field when null", () => {
    const embed = renderEmbed(makeInput()).toJSON()
    expect(embed.fields?.find((f) => f.name === "Replay verification")).toBeUndefined()
  })

  it("includes replay verification field when provided", () => {
    const embed = renderEmbed(makeInput({ replayVerification: "✅ Passed" })).toJSON()
    const field = embed.fields?.find((f) => f.name === "Replay verification")
    expect(field?.value).toBe("✅ Passed")
    expect(field?.inline).toBe(true)
  })

  it("omits video proof field when empty string", () => {
    const embed = renderEmbed(makeInput({ videoProof: "" })).toJSON()
    expect(embed.fields?.find((f) => f.name === "Video proof")).toBeUndefined()
  })

  it("omits status field when empty string", () => {
    const embed = renderEmbed(makeInput({ statusText: "" })).toJSON()
    expect(embed.fields?.find((f) => f.name === "Status")).toBeUndefined()
  })
})
