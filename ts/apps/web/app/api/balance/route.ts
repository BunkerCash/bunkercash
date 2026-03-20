import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { cachedFetch } from "@bunkercash/cloudflare-kv";
import { fetchTokenBalance, type BalanceResponse } from "@/lib/solana-server";

export const runtime = "nodejs";

const BINDING = "GEOBLOCKING_KV";
const TTL_SECONDS = 15;

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
    const { data, cacheHit } = await cachedFetch<BalanceResponse>(
      BINDING,
      cacheKey,
      TTL_SECONDS,
      () => fetchTokenBalance(wallet),
    );

    const elapsed = performance.now() - start;

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": `public, s-maxage=${TTL_SECONDS}, stale-while-revalidate=${TTL_SECONDS * 2}`,
        "X-Cache": cacheHit ? "HIT" : "MISS",
        "X-Response-Time": `${elapsed.toFixed(1)}ms`,
        "Server-Timing": `total;dur=${elapsed.toFixed(1)};desc="${cacheHit ? "kv-hit" : "rpc-fetch"}"`,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch balance" },
      { status: 500 },
    );
  }
}
