const USDC_DECIMALS = 6;
const BASIS_POINTS_DECIMALS = 2;
const MAX_FEE_BPS = 1_000;

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

export function formatPercentFromBps(raw: number | bigint): string {
  const value = typeof raw === "bigint" ? Number(raw) : raw;
  const whole = Math.trunc(value / 100);
  const frac = Math.abs(value % 100);
  const formatted = `${whole}.${frac.toString().padStart(BASIS_POINTS_DECIMALS, "0")}`;
  return formatted.replace(/\.?0+$/, "");
}

export function parseFeePercentInput(
  value: string,
  options: { allowZero?: boolean; maxBps?: number } = {},
): number | null {
  const trimmed = value.trim();
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(trimmed);
  if (!match) return null;

  const whole = Number(match[1]);
  const frac = Number((match[2] ?? "").padEnd(BASIS_POINTS_DECIMALS, "0").slice(0, BASIS_POINTS_DECIMALS));
  const bps = whole * 100 + frac;
  const maxBps = options.maxBps ?? MAX_FEE_BPS;

  if (bps > maxBps) return null;
  if (bps > 0) return bps;
  return options.allowZero ? bps : null;
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
