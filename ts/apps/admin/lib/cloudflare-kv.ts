import { kvGet, kvPut } from "@bunkercash/cloudflare-kv";
import { COUNTRIES } from "./countries";

const VALID_COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID!;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN!;

const BINDING = "GEOBLOCKING_KV";
const KEY = "geoblocking:blocked_countries";

export function parseBlockedCountries(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("Blocked countries payload is malformed");
  }
  return value;

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
