import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createMetricsClient, getLatestSnapshot } from "@bunkercash/metrics-data";
import { fetchPoolData, type PoolDataResponse } from "@/lib/solana-server";

export const runtime = "nodejs";

async function d1Fallback(): Promise<PoolDataResponse | null> {
  try {
    const ctx = await getCloudflareContext();
    const db = (ctx.env as Record<string, unknown>).METRICS_DB as D1Database | undefined;
    if (!db) return null;
    const client = createMetricsClient(db);
    try {
      const row = await getLatestSnapshot(client);
      if (!row) return null;
      return {
        tokenPrice: row.pricePerToken ?? row.tokenPrice ?? 1,
        totalSupplyRaw: row.totalSupply ?? 0,
        navUsdcRaw: row.navUsdc ?? 0,
        pendingClaimsUsdcRaw: row.pendingClaimsUsdc ?? 0,
        treasuryUsdcRaw: row.treasuryUsdc ?? null,
        pricePerToken: row.pricePerToken ?? row.tokenPrice ?? 1,
        adminWallet: row.adminWallet ?? null,
        ts: Date.now(),
      };
    } finally {
      await client.$disconnect();
    }
  } catch {
    return null;
  }
}

// Public read-only: serves on-chain pool state already visible on Solana.
// No admin auth — AuthProvider uses this to resolve the admin wallet before any signing is possible.
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
    console.error("[pool-data] Primary RPC failed:", errorMessage);

    const fallbackUrl = process.env.WEB_POOL_DATA_FALLBACK_URL;
    if (fallbackUrl) {
      try {
        const fallback = await fetch(fallbackUrl, { cache: "no-store" });
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
          },
        });
      } catch (fallbackError: unknown) {
        console.error("[pool-data] Fallback also failed:", fallbackError);
      }
    }

    console.log("[pool-data] Trying D1 fallback...");
    const d1Data = await d1Fallback();
    if (d1Data) {
      const elapsed = performance.now() - start;
      return NextResponse.json(d1Data, {
        headers: {
          "Cache-Control": "no-store",
          "X-Cache": "D1-FALLBACK",
          "X-Response-Time": `${elapsed.toFixed(1)}ms`,
          "Server-Timing": `total;dur=${elapsed.toFixed(1)};desc="d1-fallback"`,
        },
      });
    }

    const elapsed = performance.now() - start;
    return NextResponse.json(
      { error: "Failed to fetch pool data" },
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
