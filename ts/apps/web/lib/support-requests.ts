import { kvGet, kvPut } from "@bunkercash/cloudflare-kv";
import {
  SUPPORT_REQUESTS_KV_BINDING,
  toSupportRequestKey,
  type CreateSupportRequestInput,
  type SupportRequestRecord,
  type SupportRequestSource,
} from "@bunkercash/support-requests";

const BINDING = SUPPORT_REQUESTS_KV_BINDING;
const RATE_LIMIT_KEY_PREFIX = "support:rate-limit:";
const FALLBACK_SUPPORT_EMAIL = "support@bunkercash.com";
const IP_RATE_LIMIT_MAX_REQUESTS = 3;
const IP_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const EMAIL_RATE_LIMIT_MAX_REQUESTS = 5;
const EMAIL_RATE_LIMIT_WINDOW_SECONDS = 24 * 60 * 60;

export type {
  CreateSupportRequestInput,
  SupportRequestRecord,
  SupportRequestSource,
} from "@bunkercash/support-requests";

interface SupportRateLimitRecord {
  count: number;
  resetAt: number;
}

export class SupportRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many support requests. Please wait and try again.");
    this.name = "SupportRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptional(value: unknown, maxLength: number): string | null {
  const normalized = readString(value);
  if (!normalized) {
    return null;
  }

  if (normalized.length > maxLength) {
    throw new Error(`Field exceeds ${maxLength} characters`);
  }

  return normalized;
}

function normalizeRequired(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  const normalized = readString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  if (normalized.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer`);
  }

  return normalized;
}

function normalizeEmail(value: unknown): string {
  const email = normalizeRequired(value, "Email", 320).toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    throw new Error("Email must be valid");
  }

  return email;
}

function normalizeSource(value: unknown): SupportRequestSource {
  if (value === "blocked-page" || value === "support-page") {
    return value;
  }

  return "support-page";
}

function getClientIp(request: Request): string | null {
  const cfConnectingIp = readString(request.headers.get("cf-connecting-ip"));
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const xRealIp = readString(request.headers.get("x-real-ip"));
  if (xRealIp) {
    return xRealIp;
  }

  const forwardedFor = readString(request.headers.get("x-forwarded-for"));
  if (!forwardedFor) {
    return null;
  }

  const [firstIp] = forwardedFor.split(",");
  return readString(firstIp);
}

async function hashIdentifier(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const data = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(data).set(encoded);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function toRateLimitKey(scope: string, hashedIdentity: string): string {
  return `${RATE_LIMIT_KEY_PREFIX}${scope}:${hashedIdentity}`;
}

async function enforceWindowRateLimit(options: {
  scope: string;
  identity: string;
  maxRequests: number;
  windowSeconds: number;
}) {
  const { scope, identity, maxRequests, windowSeconds } = options;
  const key = toRateLimitKey(scope, await hashIdentifier(identity));
  const now = Date.now();
  const existing = await kvGet<SupportRateLimitRecord>(BINDING, key);

  if (existing && existing.resetAt > now) {
    if (existing.count >= maxRequests) {
      throw new SupportRateLimitError(
        Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      );
    }

    const ttlSeconds = Math.max(
      60,
      Math.ceil((existing.resetAt - now) / 1000) + 60,
    );

    await kvPut(
      BINDING,
      key,
      {
        count: existing.count + 1,
        resetAt: existing.resetAt,
      } satisfies SupportRateLimitRecord,
      { expirationTtl: ttlSeconds },
    );
    return;
  }

  await kvPut(
    BINDING,
    key,
    {
      count: 1,
      resetAt: now + windowSeconds * 1000,
    } satisfies SupportRateLimitRecord,
    { expirationTtl: Math.max(60, windowSeconds + 60) },
  );
}

export function parseSupportRequestInput(
  value: unknown,
): CreateSupportRequestInput {
  if (!value || typeof value !== "object") {
    throw new Error("Request body must be a JSON object");
  }

  const payload = value as Record<string, unknown>;

  return {
    fullName: normalizeRequired(payload.fullName, "Full name", 120),
    email: normalizeEmail(payload.email),
    phone: normalizeOptional(payload.phone, 40),
    country: normalizeOptional(payload.country, 80),
    subject: normalizeRequired(payload.subject, "Subject", 160),
    message: normalizeRequired(payload.message, "Message", 4000),
    source: normalizeSource(payload.source),
    pageUrl: normalizeOptional(payload.pageUrl, 512),
  };
}

export function getSupportContactDetails() {
  return {
    email:
      process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || FALLBACK_SUPPORT_EMAIL,
    phone: process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() || null,
  };
}

export function isSupportRateLimitError(
  error: unknown,
): error is SupportRateLimitError {
  return error instanceof SupportRateLimitError;
}

export async function enforceSupportRequestRateLimit(
  request: Request,
  input: CreateSupportRequestInput,
) {
  const checks: Promise<void>[] = [
    enforceWindowRateLimit({
      scope: "email",
      identity: input.email,
      maxRequests: EMAIL_RATE_LIMIT_MAX_REQUESTS,
      windowSeconds: EMAIL_RATE_LIMIT_WINDOW_SECONDS,
    }),
  ];

  const clientIp = getClientIp(request);
  if (clientIp) {
    checks.push(
      enforceWindowRateLimit({
        scope: "ip",
        identity: clientIp,
        maxRequests: IP_RATE_LIMIT_MAX_REQUESTS,
        windowSeconds: IP_RATE_LIMIT_WINDOW_SECONDS,
      }),
    );
  }

  await Promise.all(checks);
}

export async function createSupportRequest(
  input: CreateSupportRequestInput,
): Promise<SupportRequestRecord> {
  const record: SupportRequestRecord = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    country: input.country,
    subject: input.subject,
    message: input.message,
    source: input.source,
    pageUrl: input.pageUrl,
  };

  await kvPut(BINDING, toSupportRequestKey(record), record);
  return record;
}
