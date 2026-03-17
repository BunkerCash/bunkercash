import { NextRequest, NextResponse } from "next/server";
import { cachedFetch } from "@bunkercash/cloudflare-kv";
import {
  fetchTransactionsForWallet,
  type TransactionsResponse,
} from "@/lib/solana-server";

export const runtime = "nodejs";

const BINDING = "GEOBLOCKING_KV";
const TTL_SECONDS = 30;

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json(
      { error: "Missing wallet query parameter" },
      { status: 400 },
    );
  }

  const start = performance.now();
  try {
    const cacheKey = `cache:transactions:${wallet}`;
    const data = await cachedFetch<TransactionsResponse>(
      BINDING,
      cacheKey,
      TTL_SECONDS,
      () => fetchTransactionsForWallet(wallet),
    );

    const elapsed = performance.now() - start;
    const cacheHit = elapsed < 500;

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
      { error: e instanceof Error ? e.message : "Failed to fetch transactions" },
      { status: 500 },
    );
  }
}
