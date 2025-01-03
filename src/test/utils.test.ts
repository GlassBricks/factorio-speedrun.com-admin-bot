import { editLine } from "../utils.js"

describe("editLine", () => {
  const message = `Hi: 1\nHello: 2\nBaz: 3\n`
  it("should append a line to end of message if header not found", () => {
    const result = editLine(message, "Bye: ", "4")
    expect(result).toBe(`Hi: 1\nHello: 2\nBaz: 3\nBye: 4\n`)

    const result2 = editLine(message.trimEnd(), "Bye: ", "4")
    expect(result2).toBe(result)
  })
  it("can edit a line if header found", () => {
    const result = editLine(message, "Hello: ", "3")
    expect(result).toBe(`Hi: 1\nHello: 3\nBaz: 3\n`)
    const result2 = editLine(message, "Hi: ", "3")
    expect(result2).toBe(`Hi: 3\nHello: 2\nBaz: 3\n`)
    const result3 = editLine(message, "Baz: ", "3")
    expect(result3).toBe(`Hi: 1\nHello: 2\nBaz: 3\n`)
  })
  it("should replace new line character with double space", () => {
    const result = editLine(message, "Hello: ", "3\n4")
    expect(result).toBe(`Hi: 1\nHello: 3  4\nBaz: 3\n`)
  })
})
