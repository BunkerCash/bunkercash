const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID!;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN!;

const KV_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}`;

const KEY = encodeURIComponent("geoblocking:blocked_countries");

// Best-effort isolate-local cache. Edge cold starts reset this state.
let cache: { countries: string[]; ts: number } | null = null;
const CACHE_TTL = 60_000; // 1 minute

export async function getBlockedCountries(): Promise<string[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return cache.countries;
  }

  try {
    const res = await fetch(`${KV_BASE}/values/${KEY}`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) {
      if (cache) return cache.countries;
      throw new Error(`KV read failed: ${res.status}`);
    }

    const text = await res.text();
    const countries: string[] = JSON.parse(text);
    cache = { countries, ts: Date.now() };
    return countries;
  } catch {
    if (cache) return cache.countries;
    throw new Error("Failed to load blocked countries from KV");
  }
}
