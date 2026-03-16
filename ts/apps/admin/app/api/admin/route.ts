import { NextResponse } from "next/server";
import { authorizeAdminAccess } from "@/lib/geoblocking-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const authorization = await authorizeAdminAccess({
      wallet: body.wallet ?? null,
      signature: body.signature ?? null,
      issuedAt: body.issuedAt ?? null,
    });

    if (!authorization.ok) {
      return NextResponse.json(
        { error: authorization.error },
        { status: 401 }
      );
    }

    return NextResponse.json({
      isAdmin: authorization.isAdmin,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to resolve admin access" },
      { status: 500 }
    );
  }
}
