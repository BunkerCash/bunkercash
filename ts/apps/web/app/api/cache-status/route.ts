import { NextResponse } from "next/server";
import { kvGet } from "@bunkercash/cloudflare-kv";

export const runtime = "nodejs";

interface CachedValue {
  ts: number;
  data: unknown;
}

const BINDING = "GEOBLOCKING_KV";

const KEYS = [
  "cache:pool_data",
  "cache:claims",
  "geoblocking:blocked_countries",
] as const;

export async function GET() {
  const results: Record<string, { cached: boolean; ageSeconds: number | null; size: string | null }> = {};

  for (const key of KEYS) {
    try {
      const raw = await kvGet<CachedValue | unknown>(BINDING, key);
      if (raw === null) {
        results[key] = { cached: false, ageSeconds: null, size: null };
      } else {
        const isTimestamped = typeof raw === "object" && raw !== null && "ts" in raw;
        const age = isTimestamped ? Math.round((Date.now() - (raw as CachedValue).ts) / 1000) : null;
        const size = `${JSON.stringify(raw).length} bytes`;
        results[key] = { cached: true, ageSeconds: age, size };
      }
    } catch {
      results[key] = { cached: false, ageSeconds: null, size: null };
    }
  }

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    entries: results,
  });
}
