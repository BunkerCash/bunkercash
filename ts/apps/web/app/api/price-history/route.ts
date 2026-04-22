import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  createMetricsClient,
  getSnapshotsByRange,
  isValidDateString,
  previousUtcDate,
} from "@bunkercash/metrics-data";

export const runtime = "nodejs";

const MAX_DAYS = 90;

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
    return NextResponse.json({ data: [] });
  }

  const db = env.METRICS_DB as D1Database | undefined;
  if (!db) {
    return NextResponse.json({ data: [] });
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

    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } },
    );
  } finally {
    await client.$disconnect();
  }
}
