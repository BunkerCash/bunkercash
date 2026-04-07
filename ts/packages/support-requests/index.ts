export const SUPPORT_REQUESTS_KV_BINDING = "GEOBLOCKING_KV";
export const SUPPORT_REQUEST_KEY_PREFIX = "support:request:";

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

export type CreateSupportRequestInput = Omit<
  SupportRequestRecord,
  "id" | "createdAt"
>;

export function isSupportRequestRecord(
  value: unknown,
): value is SupportRequestRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const optionalString = (field: unknown) =>
    field === null || typeof field === "string";

  return (
    typeof record.id === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.fullName === "string" &&
    typeof record.email === "string" &&
    optionalString(record.phone) &&
    optionalString(record.country) &&
    typeof record.subject === "string" &&
    typeof record.message === "string" &&
    (record.source === "blocked-page" || record.source === "support-page") &&
    optionalString(record.pageUrl)
  );
}

export function toSupportRequestKey(record: {
  id: string;
  createdAt: string;
}): string {
  return `${SUPPORT_REQUEST_KEY_PREFIX}${record.createdAt}:${record.id}`;
}
