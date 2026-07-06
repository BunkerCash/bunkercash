import { NextResponse } from "next/server";
import {
  enforceAdminChallengeRateLimit,
  getAdminAuthDomain,
  isAdminAuthRateLimitError,
  issueAdminAuthChallenge,
} from "@/lib/admin-auth-nonce";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      method?: unknown;
      route?: unknown;
      bodyHash?: unknown;
      wallet?: unknown;
    };

    if (
      typeof body.wallet !== "string" ||
      typeof body.method !== "string" ||
      typeof body.route !== "string" ||
      typeof body.bodyHash !== "string"
    ) {
      return NextResponse.json(
        { error: "Challenge request is malformed" },
        { status: 400 },
      );
    }

    await enforceAdminChallengeRateLimit({
      request,
      wallet: body.wallet,
    });

    const challenge = await issueAdminAuthChallenge({
      wallet: body.wallet,
      domain: getAdminAuthDomain(request),
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
    if (isAdminAuthRateLimitError(error)) {
      return NextResponse.json(
        { error: error.message },
        {
          status: 429,
          headers: {
            "Retry-After": error.retryAfterSeconds.toString(),
          },
        },
      );
    }

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
