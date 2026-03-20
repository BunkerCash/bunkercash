import { NextResponse } from "next/server";
import { cachedFetch } from "@bunkercash/cloudflare-kv";
import { fetchAllClaims, type ClaimsResponse } from "@/lib/solana-server";

export const runtime = "nodejs";

const BINDING = "GEOBLOCKING_KV";
const CACHE_KEY = "cache:claims";
const TTL_SECONDS = 30;

export async function GET() {
  const start = performance.now();
  try {
    const { data, cacheHit } = await cachedFetch<ClaimsResponse>(
      BINDING,
      CACHE_KEY,
      TTL_SECONDS,
      fetchAllClaims,
    );

    const elapsed = performance.now() - start;

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
      { error: e instanceof Error ? e.message : "Failed to fetch claims" },
      { status: 500 },
    );
  }
}
