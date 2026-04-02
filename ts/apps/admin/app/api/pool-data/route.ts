import { NextResponse } from "next/server";
import { cachedFetch } from "@bunkercash/cloudflare-kv";
import { fetchPoolData, type PoolDataResponse } from "@/lib/solana-server";

export const runtime = "nodejs";

const BINDING = "GEOBLOCKING_KV";
const CACHE_KEY = "cache:admin_pool_data";
const TTL_SECONDS = 30;
const FALLBACK_ADMIN_WALLET =
  process.env.NEXT_PUBLIC_ADMIN_OVERRIDE ??
  "Hmod5q5Egi1yqiRCAAgZBh1iD8o8kALVQV8WKBM84JhK";

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
    const fallback: PoolDataResponse = {
      tokenPrice: 1,
      totalSupplyRaw: 0,
      navUsdcRaw: 0,
      pendingClaimsUsdcRaw: 0,
      treasuryUsdcRaw: 0,
      pricePerToken: 1,
      adminWallet: FALLBACK_ADMIN_WALLET,
      ts: Date.now(),
    };

    return NextResponse.json(fallback, {
      headers: {
        "Cache-Control": "no-store",
        "X-Cache": "FALLBACK",
        "X-Admin-Fallback": "true",
        "X-Error": e instanceof Error ? e.message : "Failed to fetch pool data",
      },
    });
  }
}
