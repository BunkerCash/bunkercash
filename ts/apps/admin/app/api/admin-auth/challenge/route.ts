import { NextResponse } from "next/server";
import { issueAdminAuthChallenge } from "@/lib/admin-auth-nonce";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      method?: unknown;
      route?: unknown;
      bodyHash?: unknown;
    };

    if (
      typeof body.method !== "string" ||
      typeof body.route !== "string" ||
      typeof body.bodyHash !== "string"
    ) {
      return NextResponse.json(
        { error: "Challenge request is malformed" },
        { status: 400 },
      );
    }

    const challenge = await issueAdminAuthChallenge({
      method: body.method,
      route: body.route,
      bodyHash: body.bodyHash,
    });

    return NextResponse.json(challenge, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to issue challenge";
    const isValidationError = message.includes("Invalid admin authorization");

    if (isValidationError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error("[admin-auth] Challenge issue failed:", message);
    return NextResponse.json(
      { error: "Failed to issue admin authorization challenge" },
      { status: 500 },
    );
  }
}
