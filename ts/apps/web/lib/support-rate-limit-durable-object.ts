import { DurableObject as CloudflareDurableObject } from "cloudflare:workers";

const RATE_LIMIT_STORAGE_KEY = "window";
const MAX_RATE_LIMIT_REQUESTS = 1000;
const MAX_RATE_LIMIT_WINDOW_SECONDS = 7 * 24 * 60 * 60;

interface SupportRateLimitRecord {
  count: number;
  resetAt: number;
}

interface SupportRateLimitCheckRequest {
  maxRequests: number;
  windowSeconds: number;
}

interface SupportRateLimitCheckResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

function readPositiveInteger(value: unknown, max: number): number | null {
  if (!Number.isInteger(value) || typeof value !== "number") {
    return null;
  }

  if (value < 1 || value > max) {
    return null;
  }

  return value;
}

function parseRateLimitCheckRequest(
  value: unknown,
): SupportRateLimitCheckRequest | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const maxRequests = readPositiveInteger(
    payload.maxRequests,
    MAX_RATE_LIMIT_REQUESTS,
  );
  const windowSeconds = readPositiveInteger(
    payload.windowSeconds,
    MAX_RATE_LIMIT_WINDOW_SECONDS,
  );

  if (!maxRequests || !windowSeconds) {
    return null;
  }

  return { maxRequests, windowSeconds };
}

function isSupportRateLimitRecord(
  value: unknown,
): value is SupportRateLimitRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.count === "number" &&
    Number.isInteger(record.count) &&
    record.count >= 0 &&
    typeof record.resetAt === "number" &&
    Number.isFinite(record.resetAt)
  );
}

function jsonResponse(value: unknown, init: ResponseInit): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");

  return new Response(JSON.stringify(value), {
    ...init,
    headers,
  });
}

export class SupportRateLimitDurableObject extends CloudflareDurableObject {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response(null, {
        status: 405,
        headers: {
          Allow: "POST",
        },
      });
    }

    const payload = await request.json().catch(() => null);
    const limit = parseRateLimitCheckRequest(payload);

    if (!limit) {
      return jsonResponse(
        { error: "Invalid rate limit request" },
        { status: 400 },
      );
    }

    const now = Date.now();
    const result = await this.ctx.storage.transaction((transaction) =>
      this.checkWindow(transaction, limit, now),
    );

    if (!result.allowed) {
      const retryAfterSeconds = Math.max(1, result.retryAfterSeconds ?? 1);

      return jsonResponse(
        { retryAfterSeconds },
        {
          status: 429,
          headers: {
            "retry-after": retryAfterSeconds.toString(),
          },
        },
      );
    }

    return new Response(null, { status: 204 });
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.delete(RATE_LIMIT_STORAGE_KEY);
  }

  private async checkWindow(
    transaction: DurableObjectTransaction,
    limit: SupportRateLimitCheckRequest,
    now: number,
  ): Promise<SupportRateLimitCheckResult> {
    const existingValue = await transaction.get<unknown>(RATE_LIMIT_STORAGE_KEY);
    const existing = isSupportRateLimitRecord(existingValue)
      ? existingValue
      : null;

    if (existing && existing.resetAt > now) {
      if (existing.count >= limit.maxRequests) {
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
        };
      }

      await transaction.put(RATE_LIMIT_STORAGE_KEY, {
        count: existing.count + 1,
        resetAt: existing.resetAt,
      } satisfies SupportRateLimitRecord);
      await transaction.setAlarm(existing.resetAt + 60 * 1000);

      return { allowed: true };
    }

    const resetAt = now + limit.windowSeconds * 1000;
    await transaction.put(RATE_LIMIT_STORAGE_KEY, {
      count: 1,
      resetAt,
    } satisfies SupportRateLimitRecord);
    await transaction.setAlarm(resetAt + 60 * 1000);

    return { allowed: true };
  }
}
