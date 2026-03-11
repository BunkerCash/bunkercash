import { NextRequest, NextResponse } from "next/server";
import { getBlockedCountries } from "@/lib/cloudflare-kv";

export async function middleware(request: NextRequest) {
  // Skip the blocked page itself to avoid redirect loops
  if (request.nextUrl.pathname === "/blocked") {
    return NextResponse.next();
  }

  // Cloudflare sets this header automatically; fall back to env override for local testing
  const country =
    request.headers.get("cf-ipcountry") ||
    process.env.GEOBLOCKING_TEST_COUNTRY ||
    null;
  if (!country) return NextResponse.next();

  const blocked = await getBlockedCountries();
  if (blocked.includes(country.toUpperCase())) {
    const url = request.nextUrl.clone();
    url.pathname = "/blocked";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Match all routes except static files and API routes
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|api/).*)"],
};
