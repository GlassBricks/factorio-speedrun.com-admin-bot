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
  test("if prefix is missing, inserts in line after previousLinePrefixIfMissing", () => {
    const result = editLine(message, "What: ", "4", "Hello: ")
    expect(result).toBe(`Hi: 1\nHello: 2\nWhat: 4\nBaz: 3\n`)
  })
  test("if prefix is missing and previousLinePrefixIfMissing is missing, appends to end of message", () => {
    const result = editLine(message, "What: ", "4", "something")
    expect(result).toBe(`Hi: 1\nHello: 2\nBaz: 3\nWhat: 4\n`)
  })
  test("editing last line", () => {
    const result = editLine(message, "Baz: ", "4")
    expect(result).toBe(`Hi: 1\nHello: 2\nBaz: 4\n`)
    const result2 = editLine(message.trimEnd(), "Baz: ", "4")
    expect(result2).toBe(`Hi: 1\nHello: 2\nBaz: 4\n`)
  })
  test("prefix is whole line", () => {
    const result = editLine(message, "Hi: 1", "4")
    expect(result).toBe(`Hi: 14\nHello: 2\nBaz: 3\n`)
    const result2 = editLine(message, "Baz: 3", "4")
    expect(result2).toBe(`Hi: 1\nHello: 2\nBaz: 34\n`)
  })
})
