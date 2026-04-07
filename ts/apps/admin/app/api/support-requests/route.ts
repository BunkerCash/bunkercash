import { NextResponse } from "next/server";
import { listSupportRequestsPage } from "@/lib/support-requests";
import { authorizeAdminAccess } from "@/lib/geoblocking-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;

    const authorization = await authorizeAdminAccess({
      wallet: request.headers.get("x-admin-wallet"),
      signature: request.headers.get("x-admin-signature"),
      issuedAt: request.headers.get("x-admin-issued-at"),
    });

    if (!authorization.ok || !authorization.isAdmin) {
      return NextResponse.json(
        {
          error: authorization.ok
            ? "Connected wallet is not authorized"
            : authorization.error,
        },
        { status: 401 },
      );
    }

    const page = await listSupportRequestsPage({ cursor, limit });
    return NextResponse.json(page);
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch support requests";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
