const DECIMAL_INPUT_PATTERN = /^\d*(?:\.\d*)?$/

export function countFractionalDigits(value: string): number {
  const trimmed = value.trim()
  const decimalIndex = trimmed.indexOf(".")

  if (decimalIndex === -1) {
    return 0
  }

  return trimmed.length - decimalIndex - 1
}

export function parseUiAmountToBaseUnits(value: string, decimals: number): bigint | null {
  const trimmed = value.trim()

  if (!trimmed || !DECIMAL_INPUT_PATTERN.test(trimmed) || !/\d/.test(trimmed)) {
    return null
  }

  const normalized = trimmed.startsWith(".") ? `0${trimmed}` : trimmed
  const [wholePart = "0", fractionalPart = ""] = normalized.split(".")

  if (fractionalPart.length > decimals) {
    return null
  }

  const raw = `${wholePart || "0"}${fractionalPart.padEnd(decimals, "0")}`
  const normalizedRaw = raw.replace(/^0+(?=\d)/, "")

  return BigInt(normalizedRaw || "0")
}
