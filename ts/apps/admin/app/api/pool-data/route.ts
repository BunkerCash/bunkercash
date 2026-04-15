import { NextResponse } from "next/server";
import { fetchPoolData, type PoolDataResponse } from "@/lib/solana-server";

export const runtime = "nodejs";
const WEB_POOL_DATA_URL =
  "https://bunkercash-web.bunkercoin.workers.dev/api/pool-data";

export async function GET() {
  const start = performance.now();
  try {
    const data: PoolDataResponse = await fetchPoolData();
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
    const errorMessage =
      e instanceof Error ? e.message : "Failed to fetch pool data";
    try {
      const fallback = await fetch(WEB_POOL_DATA_URL, { cache: "no-store" });
      if (!fallback.ok) {
        throw new Error(`Fallback failed with ${fallback.status}`);
      }
      const data = (await fallback.json()) as PoolDataResponse;
      const elapsed = performance.now() - start;
      return NextResponse.json(data, {
        headers: {
          "Cache-Control": "no-store",
          "X-Cache": "FALLBACK",
          "X-Response-Time": `${elapsed.toFixed(1)}ms`,
          "Server-Timing": `total;dur=${elapsed.toFixed(1)};desc="web-fallback"`,
          "X-Error": errorMessage,
        },
      });
    } catch (fallbackError: unknown) {
      const elapsed = performance.now() - start;
      const fallbackMessage =
        fallbackError instanceof Error
          ? fallbackError.message
          : "Fallback fetch failed";

      return NextResponse.json(
        { error: `${errorMessage} | ${fallbackMessage}` },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "X-Cache": "MISS",
            "X-Response-Time": `${elapsed.toFixed(1)}ms`,
            "Server-Timing": `total;dur=${elapsed.toFixed(1)};desc="pool-data-error"`,
          },
        },
      );
    }
  }
}
