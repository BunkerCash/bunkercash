import { NextResponse } from "next/server";
import { cachedFetch } from "@bunkercash/cloudflare-kv";
import { fetchRecentEvents, type EventsResponse } from "@/lib/solana-server";

export const runtime = "nodejs";

const BINDING = "GEOBLOCKING_KV";
const CACHE_KEY = "cache:admin_events";
const TTL_SECONDS = 30;

export async function GET() {
  const start = performance.now();
  try {
    const { data, cacheHit, staleFallback } = await cachedFetch<EventsResponse>(
      BINDING,
      CACHE_KEY,
      TTL_SECONDS,
      () => fetchRecentEvents(20),
    );

    const elapsed = performance.now() - start;
    const cacheStatus = staleFallback ? "STALE" : cacheHit ? "HIT" : "MISS";

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": `public, s-maxage=${TTL_SECONDS}, stale-while-revalidate=${TTL_SECONDS * 2}`,
        "X-Cache": cacheStatus,
        "X-Response-Time": `${elapsed.toFixed(1)}ms`,
        "Server-Timing": `total;dur=${elapsed.toFixed(1)};desc="${cacheStatus === "MISS" ? "rpc-fetch" : `kv-${cacheStatus.toLowerCase()}`}"`,
      },
    });
  } catch (e: unknown) {
    const errorMessage =
      e instanceof Error ? e.message : "Failed to fetch events";
    const elapsed = performance.now() - start;

    return NextResponse.json(
      { error: errorMessage },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "X-Cache": "FALLBACK",
          "X-Response-Time": `${elapsed.toFixed(1)}ms`,
          "Server-Timing": `total;dur=${elapsed.toFixed(1)};desc="events-error"`,
          "X-Error": errorMessage,
        },
      },
    );
  }
}
