import { NextResponse } from "next/server";
import {
  getBlockedCountries,
  setBlockedCountries,
} from "@/lib/cloudflare-kv";

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
    const body = await request.json();
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
