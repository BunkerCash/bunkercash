import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedAdminWallets } from "@/lib/geoblocking-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const wallet = request.nextUrl.searchParams.get("wallet");
    const authorizedWallets = await getAuthorizedAdminWallets();
    const [adminAddress] = authorizedWallets.values();

    return NextResponse.json({
      adminAddress: adminAddress ?? null,
      isAdmin: wallet ? authorizedWallets.has(wallet) : false,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to resolve admin access" },
      { status: 500 }
    );
  }
}
