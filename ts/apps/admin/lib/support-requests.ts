import { getCloudflareContext } from "@opennextjs/cloudflare";

const SUPPORT_REQUESTS_KV_BINDING = "GEOBLOCKING_KV";
const SUPPORT_REQUEST_KEY_PREFIX = "support:request:";

const BINDING = SUPPORT_REQUESTS_KV_BINDING;
const REQUEST_KEY_PREFIX = SUPPORT_REQUEST_KEY_PREFIX;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

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

export interface SupportRequestsPage {
  requests: SupportRequestRecord[];
  nextCursor: string | null;
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

async function getKvNamespace(binding: string) {
  const { env } = await getCloudflareContext();
  const kv = (env as Record<string, unknown>)[binding];

  if (!kv || typeof kv !== "object") {
    throw new Error(`KV binding "${binding}" not found in environment`);
  }

  return kv as {
    get(key: string, type: "json"): Promise<unknown>;
    list(options?: {
      prefix?: string;
      limit?: number;
      cursor?: string;
    }): Promise<{
      cursor?: string;
      list_complete: boolean;
      keys: Array<{ name: string }>;
    }>;
  };
}

function clampPageSize(limit: number | undefined): number {
  if (!Number.isFinite(limit) || !limit) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limit)));
}

async function listAllSupportRequestKeys(): Promise<string[]> {
  const kv = await getKvNamespace(BINDING);
  const keys: string[] = [];
  let cursor: string | undefined;

  while (true) {
    const page = await kv.list({
      prefix: REQUEST_KEY_PREFIX,
      cursor,
      limit: MAX_PAGE_SIZE,
    });

    for (const key of page.keys) {
      keys.push(key.name);
    }

    if (page.list_complete || !page.cursor) {
      break;
    }

    cursor = page.cursor;
  }

  return keys.sort((a, b) => b.localeCompare(a));
}

export async function listSupportRequestsPage(options?: {
  cursor?: string | null;
  limit?: number;
}): Promise<SupportRequestsPage> {
  const limit = clampPageSize(options?.limit);
  const sortedKeys = await listAllSupportRequestKeys();
  const cursor = options?.cursor ?? null;
  const startIndex = cursor ? sortedKeys.indexOf(cursor) + 1 : 0;

  if (cursor && startIndex === 0) {
    return { requests: [], nextCursor: null };
  }

  const pageKeys = sortedKeys.slice(startIndex, startIndex + limit);
  const kv = await getKvNamespace(BINDING);
  const requests = await Promise.all(
    pageKeys.map(async (key) => {
      const value = await kv.get(key, "json");
      return isSupportRequestRecord(value) ? value : null;
    }),
  );

  const nextCursor =
    startIndex + pageKeys.length < sortedKeys.length && pageKeys.length > 0
      ? pageKeys[pageKeys.length - 1]
      : null;

  return {
    requests: requests.filter(
      (request): request is SupportRequestRecord => request !== null,
    ),
    nextCursor,
  };
}
