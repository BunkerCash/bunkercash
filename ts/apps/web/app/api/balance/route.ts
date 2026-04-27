import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { cachedFetch } from "@bunkercash/cloudflare-kv";
import { fetchTokenBalance, type BalanceResponse } from "@/lib/solana-server";

export const runtime = "nodejs";

const BINDING = "GEOBLOCKING_KV";
const TTL_SECONDS = 15;

// Public read-only: on-chain token balance for a given wallet, KV-cached.
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json(
      { error: "Missing wallet query parameter" },
      { status: 400 },
    );
  }

  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json(
      { error: "Invalid wallet address" },
      { status: 400 },
    );
  }

  const start = performance.now();
  try {
    const cacheKey = `cache:balance:${wallet}`;
    const { data, cacheHit, staleFallback } = await cachedFetch<BalanceResponse>(
      BINDING,
      cacheKey,
      TTL_SECONDS,
      () => fetchTokenBalance(wallet),
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
    console.error("[balance] Failed:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "Failed to fetch balance" },
      { status: 500 },
    );
  }
}
