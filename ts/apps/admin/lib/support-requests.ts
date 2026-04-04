import { kvGet, kvList } from "@bunkercash/cloudflare-kv";

const BINDING = "GEOBLOCKING_KV";
const REQUEST_KEY_PREFIX = "support:request:";

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

function isSupportRequestRecord(value: unknown): value is SupportRequestRecord {
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

export async function listSupportRequests(
  maxItems = 100,
): Promise<SupportRequestRecord[]> {
  const keys: string[] = [];
  let cursor: string | undefined;

  while (keys.length < maxItems) {
    const page = await kvList(BINDING, {
      prefix: REQUEST_KEY_PREFIX,
      cursor,
      limit: Math.min(100, maxItems - keys.length),
    });

    for (const key of page.keys) {
      keys.push(key.name);
      if (keys.length >= maxItems) {
        break;
      }
    }

    if (page.list_complete || !page.cursor) {
      break;
    }

    cursor = page.cursor;
  }

  const requests = await Promise.all(
    keys.map(async (key) => {
      const value = await kvGet<unknown>(BINDING, key);
      return isSupportRequestRecord(value) ? value : null;
    }),
  );

  return requests
    .filter((request): request is SupportRequestRecord => request !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
