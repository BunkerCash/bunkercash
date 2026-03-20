import { NextRequest, NextResponse } from "next/server";
import { getBlockedCountries } from "@/lib/cloudflare-kv";

function getRequestCountry(request: NextRequest) {
  if (process.env.GEOBLOCKING_TEST_COUNTRY) {
    return process.env.GEOBLOCKING_TEST_COUNTRY;
  }

  if (process.env.TRUST_CLOUDFLARE_HEADERS !== "true") {
    return null;
  }

  return request.headers.get("cf-ipcountry");
}

export async function middleware(request: NextRequest) {
  // Skip the blocked page itself to avoid redirect loops
  if (request.nextUrl.pathname === "/blocked") {
    return NextResponse.next();
  }

  // Only trust Cloudflare-provided geolocation when explicitly enabled.
  const country = getRequestCountry(request);
  if (!country) return NextResponse.next();

  try {
    const blocked = await getBlockedCountries();
    if (blocked.includes(country.toUpperCase())) {
      const url = request.nextUrl.clone();
      url.pathname = "/blocked";
      return NextResponse.rewrite(url);
    }
  } catch {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  // Match all routes except static files and API routes
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|api/).*)"],
};
