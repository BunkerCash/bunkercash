import { countFractionalDigits, parseUiAmountToBaseUnits } from "./amounts"

describe("parseUiAmountToBaseUnits", () => {
  it("parses exact decimal strings without float rounding", () => {
    expect(parseUiAmountToBaseUnits("0.123456", 6)).toBe(123456n)
    expect(parseUiAmountToBaseUnits("1.000001", 6)).toBe(1000001n)
    expect(parseUiAmountToBaseUnits(".5", 6)).toBe(500000n)
    expect(parseUiAmountToBaseUnits("1.", 6)).toBe(1000000n)
  })

  it("rejects invalid or over-precision values", () => {
    expect(parseUiAmountToBaseUnits("", 6)).toBeNull()
    expect(parseUiAmountToBaseUnits("abc", 6)).toBeNull()
    expect(parseUiAmountToBaseUnits("1.0000001", 6)).toBeNull()
  })
})

describe("countFractionalDigits", () => {
  it("counts digits after the decimal point", () => {
    expect(countFractionalDigits("42")).toBe(0)
    expect(countFractionalDigits("42.0")).toBe(1)
    expect(countFractionalDigits("42.000001")).toBe(6)
  })
})
