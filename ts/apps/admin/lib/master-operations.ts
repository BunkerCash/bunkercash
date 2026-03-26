const USDC_DECIMALS = 6;

interface ParseUsdcInputOptions {
  allowZero?: boolean;
}

export function formatUsdc(raw: string | bigint): string {
  const value = typeof raw === "string" ? BigInt(raw) : raw;
  const whole = value / BigInt(10 ** USDC_DECIMALS);
  const frac = value % BigInt(10 ** USDC_DECIMALS);
  return `${whole.toString()}.${frac.toString().padStart(USDC_DECIMALS, "0").slice(0, 2)}`;
}

export function parseUsdcInput(
  value: string,
  options: ParseUsdcInputOptions = {},
): bigint | null {
  const trimmed = value.trim();
  const match = /^(\d+)(?:\.(\d{0,6}))?$/.exec(trimmed);
  if (!match) return null;

  const whole = BigInt(match[1]);
  const fracStr = (match[2] ?? "").padEnd(USDC_DECIMALS, "0").slice(0, USDC_DECIMALS);
  const result = whole * BigInt(10 ** USDC_DECIMALS) + BigInt(fracStr);

  if (result > BigInt(0)) return result;
  return options.allowZero ? result : null;
}

export function metadataBytesToHex(bytes: Iterable<number>): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function shortPk(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export async function parseMetadataHashInput(input: string): Promise<Uint8Array> {
  const trimmed = input.trim();
  const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return Uint8Array.from(hex.match(/.{1,2}/g)!.map((pair) => parseInt(pair, 16)));
  }

  const encoded = new TextEncoder().encode(trimmed);
  const digest = await crypto.subtle.digest("SHA-256", encoded.buffer as ArrayBuffer);
  return new Uint8Array(digest);
}
