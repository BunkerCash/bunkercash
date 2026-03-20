import { kvGet } from "@bunkercash/cloudflare-kv";

const BINDING = "GEOBLOCKING_KV";
const KEY = "geoblocking:blocked_countries";

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
