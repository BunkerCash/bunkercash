/**
 * Cloudflare KV binding accessor for the OpenNext runtime.
 *
 * In the Cloudflare Workers/Pages environment, KV namespaces are available
 * via `getCloudflareContext()` from @opennextjs/cloudflare.  This replaces
 * all REST API calls with native sub-ms edge reads.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

// ── Core accessor ──────────────────────────────────────

export async function getKVNamespace(binding: string): Promise<KVNamespace> {
  const { env } = await getCloudflareContext();
  const kv = (env as Record<string, KVNamespace>)[binding];
  if (!kv) {
    throw new Error(`KV binding "${binding}" not found in environment`);
  }
  return kv;
}

// ── Typed helpers ──────────────────────────────────────

export async function kvGet<T>(
  binding: string,
  key: string,
): Promise<T | null> {
  const kv = await getKVNamespace(binding);
  return kv.get<T>(key, "json");
}

export async function kvPut<T>(
  binding: string,
  key: string,
  value: T,
  options?: { expirationTtl?: number },
): Promise<void> {
  const kv = await getKVNamespace(binding);
  await kv.put(key, JSON.stringify(value), options);
}

export async function kvDelete(binding: string, key: string): Promise<void> {
  const kv = await getKVNamespace(binding);
  await kv.delete(key);
}

// ── Read-through cache ─────────────────────────────────

interface CachedValue<T> {
  data: T;
  ts: number;
}

/**
 * Read-through cache: check KV first, fall back to fetcher, write result back.
 * `ttlSeconds` controls the freshness window — stale entries are re-fetched.
 */
export interface CachedFetchResult<T> {
  data: T;
  cacheHit: boolean;
}

// In-flight deduplication map — prevents concurrent requests from
// stampeding the origin when the cache is cold or stale.
const inflight = new Map<string, Promise<CachedFetchResult<unknown>>>();

export async function cachedFetch<T>(
  binding: string,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<CachedFetchResult<T>> {
  let staleData: T | null = null;

  try {
    const cached = await kvGet<CachedValue<T>>(binding, key);
    if (cached) {
      if (Date.now() - cached.ts < ttlSeconds * 1000) {
        return { data: cached.data, cacheHit: true };
      }
      // Keep stale data as fallback in case the fetcher fails
      staleData = cached.data;
    }
  } catch {
    // KV read failed — fall through to fetcher
  }

  const flightKey = `${binding}:${key}`;
  const existing = inflight.get(flightKey);
  if (existing) {
    return existing as Promise<CachedFetchResult<T>>;
  }

  const promise = (async (): Promise<CachedFetchResult<T>> => {
    let data: T;
    try {
      data = await fetcher();
    } catch (err) {
      // Fetcher failed — serve stale cached data if available
      if (staleData !== null) {
        return { data: staleData, cacheHit: true };
      }
      throw err;
    }

    // Await the write so the cache is populated before returning.
    // Use a minimum TTL of 60s (Cloudflare KV enforced minimum).
    try {
      await kvPut(
        binding,
        key,
        { data, ts: Date.now() } satisfies CachedValue<T>,
        { expirationTtl: Math.max(ttlSeconds * 2, 60) },
      );
    } catch {
      // KV write failed — data is still returned, just not cached
    }

    return { data, cacheHit: false };
  })();

  inflight.set(flightKey, promise as Promise<CachedFetchResult<unknown>>);
  try {
    return await promise;
  } finally {
    inflight.delete(flightKey);
  }
}
