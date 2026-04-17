import { NextResponse } from "next/server";
import {
  createSupportRequest,
  enforceSupportRequestRateLimit,
  isSupportRateLimitError,
  parseSupportRequestInput,
} from "@/lib/support-requests";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseSupportRequestInput(body);
    await enforceSupportRequestRateLimit(request, input);
    const record = await createSupportRequest(input);

    return NextResponse.json(
      {
        ok: true,
        requestId: record.id,
        createdAt: record.createdAt,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (isSupportRateLimitError(error)) {
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

    const rawMessage =
      error instanceof Error
        ? error.message
        : "Failed to submit support request";

    const isValidationError =
      rawMessage.includes("required") ||
      rawMessage.includes("must be") ||
      rawMessage.includes("valid") ||
      rawMessage.includes("JSON object") ||
      rawMessage.includes("Field exceeds");

    if (isValidationError) {
      return NextResponse.json({ error: rawMessage }, { status: 400 });
    }

    console.error("[support] Failed:", rawMessage);
    return NextResponse.json({ error: "Failed to submit support request" }, { status: 500 });
  }
}
