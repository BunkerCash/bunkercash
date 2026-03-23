import { kvGet, kvPut } from "@bunkercash/cloudflare-kv";
import { COUNTRIES } from "./countries";

const VALID_COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));

const BINDING = "GEOBLOCKING_KV";
const KEY = "geoblocking:blocked_countries";

export function parseBlockedCountries(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("Blocked countries payload is malformed");
  }

  const invalid = (value as string[]).find(
    (code) => !VALID_COUNTRY_CODES.has(code.toUpperCase())
  );
  if (invalid) {
    throw new Error(`Invalid country code: ${invalid}`);
  }

  return value as string[];
}

function normalizeCountries(countries: string[]): string[] {
  return [...new Set(countries.map((c) => c.toUpperCase().trim()))].sort();
}

export async function getBlockedCountries(): Promise<string[]> {
  const countries = await kvGet<unknown>(BINDING, KEY);
  if (!countries) return [];
  // Runtime validation — reject malformed KV data rather than trusting the cast
  if (
    !Array.isArray(countries) ||
    countries.some((item) => typeof item !== "string")
  ) {
    return [];
  }
  return countries as string[];
}

export async function setBlockedCountries(
  countries: string[],
): Promise<string[]> {
  const normalized = normalizeCountries(countries);
  parseBlockedCountries(normalized);
  await kvPut(BINDING, KEY, normalized);
  return normalized;
}
