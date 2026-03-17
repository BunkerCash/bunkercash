import { NextResponse } from "next/server";
import { cachedFetch } from "@bunkercash/cloudflare-kv";
import { fetchPoolData, type PoolDataResponse } from "@/lib/solana-server";

export const runtime = "nodejs";

const BINDING = "GEOBLOCKING_KV";
const CACHE_KEY = "cache:pool_data";
const TTL_SECONDS = 30;

export async function GET() {
  const start = performance.now();
  try {
    const data = await cachedFetch<PoolDataResponse>(
      BINDING,
      CACHE_KEY,
      TTL_SECONDS,
      fetchPoolData,
    );

    const elapsed = performance.now() - start;
    const cacheHit = elapsed < 500; // RPC calls take 1s+, KV reads < 100ms

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": `public, s-maxage=${TTL_SECONDS}, stale-while-revalidate=${TTL_SECONDS * 2}`,
        "X-Cache": cacheHit ? "HIT" : "MISS",
        "X-Response-Time": `${elapsed.toFixed(1)}ms`,
        "Server-Timing": `total;dur=${elapsed.toFixed(1)};desc="${cacheHit ? "kv-hit" : "rpc-fetch"}"`,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch pool data" },
      { status: 500 },
    );
  }
}
