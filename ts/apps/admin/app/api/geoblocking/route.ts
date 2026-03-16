import { NextResponse } from "next/server";
import {
  getBlockedCountries,
  setBlockedCountries,
} from "@/lib/cloudflare-kv";
import { authorizeGeoblockingUpdate } from "@/lib/geoblocking-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const countries = await getBlockedCountries();
    return NextResponse.json({ countries });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to fetch blocked countries" },
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

    const body = JSON.parse(bodyText);
    const countries: string[] = body.countries;

    if (!Array.isArray(countries)) {
      return NextResponse.json(
        { error: "countries must be an array" },
        { status: 400 }
      );
    }

    await setBlockedCountries(countries);
    const updated = await getBlockedCountries();
    return NextResponse.json({ countries: updated });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to update blocked countries" },
      { status: 500 }
    );
  }
}
