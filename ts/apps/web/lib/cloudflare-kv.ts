import { kvGet } from "@bunkercash/cloudflare-kv";

const BINDING = "GEOBLOCKING_KV";
const KEY = "geoblocking:blocked_countries";

export async function getBlockedCountries(): Promise<string[]> {
  const countries = await kvGet<string[]>(BINDING, KEY);
  return countries ?? [];
}
