import { NextResponse } from "next/server";
import { cachedFetch } from "@bunkercash/cloudflare-kv";
import { fetchRecentEvents, type EventsResponse } from "@/lib/solana-server";

export const runtime = "nodejs";

const BINDING = "GEOBLOCKING_KV";
const CACHE_KEY = "cache:admin_events";
const TTL_SECONDS = 30;

export async function GET() {
  try {
    const data = await cachedFetch<EventsResponse>(
      BINDING,
      CACHE_KEY,
      TTL_SECONDS,
      () => fetchRecentEvents(20),
    );

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": `public, s-maxage=${TTL_SECONDS}, stale-while-revalidate=${TTL_SECONDS * 2}`,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch events" },
      { status: 500 },
    );
  }
}
