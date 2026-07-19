import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  createMetricsClient,
  getSnapshotsByRange,
  isValidDateString,
  previousUtcDate,
} from "@bunkercash/metrics-data";
import { fetchPoolData } from "@/lib/solana-server";

export const runtime = "nodejs";

const MAX_DAYS = 90;

async function liveDataFallback(): Promise<{ date: string; price: number }[]> {
  try {
    const pool = await fetchPoolData();
    if (pool.pricePerToken != null && pool.pricePerToken > 0) {
      const today = new Date().toISOString().slice(0, 10);
      return [
        { date: today, price: pool.pricePerToken },
        { date: today, price: pool.pricePerToken },
      ];
    }
  } catch {
    // RPC also failed
  }
  return [];
}

// Public read-only: historical price snapshots from D1.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const days = Math.min(
    Math.max(parseInt(url.searchParams.get("days") ?? "30", 10) || 30, 1),
    MAX_DAYS,
  );

  const to = previousUtcDate();
  const fromDate = new Date(to + "T00:00:00Z");
  fromDate.setUTCDate(fromDate.getUTCDate() - days + 1);
  const from = fromDate.toISOString().slice(0, 10);

  if (!isValidDateString(from) || !isValidDateString(to)) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  let env: Record<string, unknown>;
  try {
    const ctx = await getCloudflareContext();
    env = ctx.env as Record<string, unknown>;
  } catch {
    const data = await liveDataFallback();
    return NextResponse.json({ data });
  }

  const db = env.METRICS_DB as D1Database | undefined;
  if (!db) {
    const data = await liveDataFallback();
    return NextResponse.json({ data });
  }

  const client = createMetricsClient(db);
  try {
    const rows = await getSnapshotsByRange(client, { from, to });

    const data = rows
      .filter((r) => r.pricePerToken != null)
      .map((r) => ({
        date: r.snapshotDate,
        price: r.pricePerToken,
      }));

    if (data.length < 2) {
      const fallback = await liveDataFallback();
      if (fallback.length > 0) {
        return NextResponse.json(
          { data: fallback },
          { headers: { "Cache-Control": "public, max-age=60, s-maxage=120" } },
        );
      }
    }

    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } },
    );
  } catch (e: unknown) {
    console.error("[price-history] D1 query failed:", e instanceof Error ? e.message : e);
    const data = await liveDataFallback();
    return NextResponse.json({ data });
  } finally {
    await client.$disconnect();
  }
}
