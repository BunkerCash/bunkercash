import { NextResponse } from "next/server";
import { fetchRecentEvents, type EventsResponse } from "@/lib/solana-server";

export const runtime = "nodejs";

export async function GET() {
  const start = performance.now();
  try {
    const data: EventsResponse = await fetchRecentEvents(20);
    const elapsed = performance.now() - start;

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
        "X-Cache": "BYPASS",
        "X-Response-Time": `${elapsed.toFixed(1)}ms`,
        "Server-Timing": `total;dur=${elapsed.toFixed(1)};desc="direct-rpc"`,
      },
    });
  } catch (e: unknown) {
    console.error("[events] RPC failed:", e instanceof Error ? e.message : e);
    const elapsed = performance.now() - start;

    return NextResponse.json(
      { events: [], ts: Date.now(), error: "Failed to fetch events" },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "X-Cache": "MISS",
          "X-Response-Time": `${elapsed.toFixed(1)}ms`,
          "Server-Timing": `total;dur=${elapsed.toFixed(1)};desc="events-error"`,
        },
      },
    );
  }
}
