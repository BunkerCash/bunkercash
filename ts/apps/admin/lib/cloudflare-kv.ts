import { getCloudflareContext } from "@opennextjs/cloudflare";
import { COUNTRIES } from "./countries";

const VALID_COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));

const BINDING = "GEOBLOCKING_KV";
const KEY = "geoblocking:blocked_countries";

async function getKvNamespace(binding: string) {
  const { env } = await getCloudflareContext();
  const kv = (env as Record<string, unknown>)[binding];

  if (!kv || typeof kv !== "object") {
    throw new Error(`KV binding "${binding}" not found in environment`);
  }

  return kv as {
    get(key: string, type: "json"): Promise<unknown>;
    put(key: string, value: string): Promise<void>;
  };
}

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
  const kv = await getKvNamespace(BINDING);
  const countries = await kv.get(KEY, "json");
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
  const kv = await getKvNamespace(BINDING);
  await kv.put(KEY, JSON.stringify(normalized));
  return normalized;
}
