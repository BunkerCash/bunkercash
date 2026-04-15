import { NextResponse } from "next/server";
import { fetchFeeConfig, type FeeConfigResponse } from "@/lib/solana-server";

export const runtime = "nodejs";

export async function GET() {
  const start = performance.now();
  try {
    const data: FeeConfigResponse = await fetchFeeConfig();
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
    const elapsed = performance.now() - start;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch fee config" },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "X-Cache": "MISS",
          "X-Response-Time": `${elapsed.toFixed(1)}ms`,
          "Server-Timing": `total;dur=${elapsed.toFixed(1)};desc="fee-config-error"`,
        },
      },
    );
  }
}
