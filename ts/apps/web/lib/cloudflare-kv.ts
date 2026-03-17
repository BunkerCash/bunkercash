const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID!;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN!;

const KV_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}`;

const KEY = encodeURIComponent("geoblocking:blocked_countries");

// NOTE: In-memory caching is intentionally omitted here.
// This middleware runs in Next.js Edge Runtime where each request
// executes in an isolated V8 context — module-level variables reset
// on every invocation and never serve a cached value. Caching should
// be done at the CDN / Cloudflare layer instead.
export async function getBlockedCountries(): Promise<string[]> {
  const res = await fetch(`${KV_BASE}/values/${KEY}`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`KV read failed: ${res.status}`);
  }

  const text = await res.text();
  return JSON.parse(text);
}
