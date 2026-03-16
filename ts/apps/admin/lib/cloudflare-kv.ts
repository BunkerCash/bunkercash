const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID!;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN!;

const KV_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}`;

const KEY = encodeURIComponent("geoblocking:blocked_countries");

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

function normalizeCountries(countries: string[]): string[] {
  return [...new Set(countries.map((c) => c.toUpperCase().trim()))].sort();
}

export async function setBlockedCountries(countries: string[]): Promise<string[]> {
  const normalized = normalizeCountries(countries);

  // Cloudflare KV write API requires multipart/form-data with a "value" field
  const form = new FormData();
  form.append("value", JSON.stringify(normalized));
  form.append("metadata", JSON.stringify({}));

  const res = await fetch(`${KV_BASE}/values/${KEY}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${API_TOKEN}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`KV write failed: ${res.status} - ${body}`);
  }

  return normalized;
}
