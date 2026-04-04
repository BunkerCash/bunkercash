import { NextResponse } from "next/server";
import { listSupportRequests } from "@/lib/support-requests";
import { authorizeAdminAccess } from "@/lib/geoblocking-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
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

    const requests = await listSupportRequests();
    return NextResponse.json({ requests });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch support requests";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
