import { NextResponse } from "next/server";
import crypto from "crypto";

const AUTH_SECRET = process.env.AUTH_SECRET || "change-me-in-production";

function signToken(payload: string): string {
  return crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("hex");
}

export async function POST(req: Request) {
  const { token } = await req.json();

  if (typeof token !== "string") {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  const lastColon = token.lastIndexOf(":");
  if (lastColon === -1) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  const payload = token.slice(0, lastColon);
  const signature = token.slice(lastColon + 1);

  const expectedSignature = signToken(payload);
  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );

  if (!isValid) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  // Check expiration
  const parts = payload.split(":");
  const expiresAt = Number(parts[1]);
  if (Number.isNaN(expiresAt) || Date.now() > expiresAt) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  return NextResponse.json({ valid: true });
}
