import { NextResponse } from "next/server";
import { cachedFetch } from "@bunkercash/cloudflare-kv";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createMetricsClient, getLatestSnapshot } from "@bunkercash/metrics-data";
import { fetchPoolData, type PoolDataResponse } from "@/lib/solana-server";

export const runtime = "nodejs";

const BINDING = "GEOBLOCKING_KV";
const CACHE_KEY = "cache:pool_data";
const TTL_SECONDS = 30;

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
        circulatingSupplyRaw: row.totalSupply ?? 0,
        escrowBunkercashRaw: 0,
        navUsdcRaw: row.navUsdc ?? 0,
        pendingClaimsUsdcRaw: row.pendingClaimsUsdc ?? 0,
        treasuryUsdcRaw: row.treasuryUsdc ?? null,
        pricePerToken: row.pricePerToken ?? row.tokenPrice ?? 1,
        adminWallet: row.adminWallet ?? "",
        purchaseFeeBps: 0,
        claimFeeBps: 0,
        minClaimUsdcRaw: 1,
        purchaseLimitUsdcRaw: null,
        totalDepositedUsdcRaw: null,
        remainingPurchaseCapacityUsdcRaw: null,
        ts: Date.now(),
      };
    } finally {
      await client.$disconnect();
    }
  } catch {
    return null;
  }
}

// Public read-only: on-chain pool state, KV-cached.
export async function GET() {
  const start = performance.now();
  try {
    const { data, cacheHit, staleFallback } = await cachedFetch<PoolDataResponse>(
      BINDING,
      CACHE_KEY,
      TTL_SECONDS,
      fetchPoolData,
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
    console.error("[pool-data] RPC failed, trying D1 fallback:", e instanceof Error ? e.message : e);

    const fallback = await d1Fallback();
    if (fallback) {
      const elapsed = performance.now() - start;
      return NextResponse.json(fallback, {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
          "X-Cache": "D1-FALLBACK",
          "X-Response-Time": `${elapsed.toFixed(1)}ms`,
        },
      });
    }

    return NextResponse.json(
      { error: "Failed to fetch pool data" },
      { status: 500 },
    );
  }
}
