import { NextResponse } from "next/server";
import {
  createSupportRequest,
  parseSupportRequestInput,
} from "@/lib/support-requests";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseSupportRequestInput(body);
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
