import { kvPut } from "@bunkercash/cloudflare-kv";

const BINDING = "GEOBLOCKING_KV";
const REQUEST_KEY_PREFIX = "support:request:";
const FALLBACK_SUPPORT_EMAIL = "support@bunkercash.com";

export type SupportRequestSource = "blocked-page" | "support-page";

export interface SupportRequestRecord {
  id: string;
  createdAt: string;
  fullName: string;
  email: string;
  phone: string | null;
  country: string | null;
  subject: string;
  message: string;
  source: SupportRequestSource;
  pageUrl: string | null;
}

export interface CreateSupportRequestInput {
  fullName: string;
  email: string;
  phone: string | null;
  country: string | null;
  subject: string;
  message: string;
  source: SupportRequestSource;
  pageUrl: string | null;
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

export function toSupportRequestKey(record: SupportRequestRecord): string {
  return `${REQUEST_KEY_PREFIX}${record.createdAt}:${record.id}`;
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
