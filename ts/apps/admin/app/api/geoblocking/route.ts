import { NextResponse } from "next/server";
import {
  getBlockedCountries,
  parseBlockedCountries,
  setBlockedCountries,
} from "@/lib/cloudflare-kv";
import {
  authorizeAdminAccess,
  authorizeGeoblockingUpdate,
} from "@/lib/geoblocking-auth";

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
        { error: authorization.ok ? "Connected wallet is not authorized" : authorization.error },
        { status: 401 }
      );
    }

    const countries = await getBlockedCountries();
    return NextResponse.json({ countries });
  } catch (e: unknown) {
    console.error("[geoblocking] GET failed:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "Failed to fetch blocked countries" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const bodyText = await request.text();
    const authorization = await authorizeGeoblockingUpdate({
      wallet: request.headers.get("x-admin-wallet"),
      signature: request.headers.get("x-admin-signature"),
      issuedAt: request.headers.get("x-admin-issued-at"),
      bodyText,
    });

    if (!authorization.ok) {
      return NextResponse.json(
        { error: authorization.error },
        { status: 401 }
      );
    }

    let body: { countries?: unknown };
    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 }
      );
    }

    const countries = parseBlockedCountries(body.countries);

    const updated = await setBlockedCountries(countries);
    return NextResponse.json({ countries: updated });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "Blocked countries payload is malformed") {
      return NextResponse.json(
        { error: "countries must be an array of strings" },
        { status: 400 }
      );
    }

    console.error("[geoblocking] PUT failed:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "Failed to update blocked countries" },
      { status: 500 }
    );
  }
}
