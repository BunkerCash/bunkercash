import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  void request;
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
