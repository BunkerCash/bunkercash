import { NextResponse } from "next/server";
import crypto from "crypto";

const AUTH_SECRET = process.env.AUTH_SECRET || "change-me-in-production";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function signToken(payload: string): string {
  return crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("hex");
}

export async function POST(req: Request) {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "Server auth not configured" },
      { status: 500 }
    );
  }

  const { username, password } = await req.json();

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username !== ADMIN_USERNAME ||
    password !== ADMIN_PASSWORD
  ) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `admin:${expiresAt}`;
  const signature = signToken(payload);
  const token = `${payload}:${signature}`;

  return NextResponse.json({ token });
}
