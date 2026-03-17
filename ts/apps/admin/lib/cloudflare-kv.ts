import { kvGet, kvPut } from "@bunkercash/cloudflare-kv";

const BINDING = "GEOBLOCKING_KV";
const KEY = "geoblocking:blocked_countries";

export function parseBlockedCountries(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("Blocked countries payload is malformed");
  }
  return value;
}

function normalizeCountries(countries: string[]): string[] {
  return [...new Set(countries.map((c) => c.toUpperCase().trim()))].sort();
}

export async function getBlockedCountries(): Promise<string[]> {
  const countries = await kvGet<string[]>(BINDING, KEY);
  return countries ?? [];
}

export async function setBlockedCountries(
  countries: string[],
): Promise<string[]> {
  const normalized = normalizeCountries(countries);
  await kvPut(BINDING, KEY, normalized);
  return normalized;
}
