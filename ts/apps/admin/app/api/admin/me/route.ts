import { NextResponse } from "next/server";
import { getAdminAuthRoute, getEmptyBodyHash } from "@/lib/admin-auth-nonce";
import { authorizeAdminAccess } from "@/lib/geoblocking-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdminAccess({
      wallet: request.headers.get("x-admin-wallet"),
      signature: request.headers.get("x-admin-signature"),
      issuedAt: request.headers.get("x-admin-issued-at"),
      nonce: request.headers.get("x-admin-nonce"),
      method: request.method,
      route: getAdminAuthRoute(request),
      bodyHash: getEmptyBodyHash(),
    });

    if (!authorization.ok) {
      return NextResponse.json(
        { error: authorization.error },
        { status: 401 },
      );
    }

    return NextResponse.json(authorization.identity, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    console.error(
      "[admin/me] Failed:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { error: "Failed to verify admin access" },
      { status: 500 },
    );
  }
}
