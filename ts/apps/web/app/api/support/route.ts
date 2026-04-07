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

    const message =
      error instanceof Error
        ? error.message
        : "Failed to submit support request";

    const status =
      message.includes("required") ||
      message.includes("must be") ||
      message.includes("valid") ||
      message.includes("JSON object") ||
      message.includes("Field exceeds")
        ? 400
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
