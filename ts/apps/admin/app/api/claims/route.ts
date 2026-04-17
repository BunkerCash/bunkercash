import { NextResponse } from "next/server";
import { fetchAllClaims, type ClaimsResponse } from "@/lib/solana-server";

export const runtime = "nodejs";
const WEB_CLAIMS_URL =
  process.env.WEB_CLAIMS_FALLBACK_URL ??
  "https://bunkercash-web.bunkercoin.workers.dev/api/claims";

export async function GET() {
  const start = performance.now();
  try {
    const data: ClaimsResponse = await fetchAllClaims();
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
      e instanceof Error ? e.message : "Failed to fetch claims";
    console.error("[claims] Primary RPC failed:", errorMessage);
    try {
      const fallback = await fetch(WEB_CLAIMS_URL, { cache: "no-store" });
      if (!fallback.ok) {
        throw new Error(`Fallback failed with ${fallback.status}`);
      }
      const data = (await fallback.json()) as ClaimsResponse;
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
      console.error("[claims] Fallback also failed:", fallbackError);
      return NextResponse.json(
        { error: "Failed to fetch claims" },
        { status: 500 },
      );
    }
  }
}
