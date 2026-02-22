import { describe, it, expect } from "vitest"
import { formatVerificationStatus, getEmbedFields } from "./embed-fields.js"
import { ReplayVerificationStatus } from "../db/replay-verification.js"

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

describe("getEmbedFields — replayVerification field", () => {
  it("omits Replay verification field when replayVerification is undefined", () => {
    const fields = getEmbedFields({
      status: "⏳ new",
      videoProof: "[YouTube video](https://youtu.be/abc)",
    })
    expect(fields.find((f) => f.name === "Replay verification")).toBeUndefined()
  })

  it("includes Replay verification field when replayVerification is present", () => {
    const fields = getEmbedFields({
      replayVerification: "✅ Passed",
    })
    const field = fields.find((f) => f.name === "Replay verification")
    expect(field).toBeDefined()
    expect(field?.value).toBe("✅ Passed")
    expect(field?.inline).toBe(true)
  })

  it("includes all fields when status, videoProof, and replayVerification are present", () => {
    const fields = getEmbedFields({
      status: "⏳ new",
      videoProof: "[YouTube video](https://youtu.be/abc)",
      replayVerification: "🔄 Running",
    })
    expect(fields.find((f) => f.name === "Status")).toBeDefined()
    expect(fields.find((f) => f.name === "Video proof")).toBeDefined()
    expect(fields.find((f) => f.name === "Replay verification")).toBeDefined()
  })
})
