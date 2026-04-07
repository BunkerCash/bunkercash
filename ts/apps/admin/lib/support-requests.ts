import { kvGet, kvList } from "@bunkercash/cloudflare-kv";
import {
  SUPPORT_REQUESTS_KV_BINDING,
  SUPPORT_REQUEST_KEY_PREFIX,
  isSupportRequestRecord,
  type SupportRequestRecord,
} from "@bunkercash/support-requests";

const BINDING = SUPPORT_REQUESTS_KV_BINDING;
const REQUEST_KEY_PREFIX = SUPPORT_REQUEST_KEY_PREFIX;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export type {
  SupportRequestRecord,
  SupportRequestSource,
} from "@bunkercash/support-requests";

export interface SupportRequestsPage {
  requests: SupportRequestRecord[];
  nextCursor: string | null;
}

function clampPageSize(limit: number | undefined): number {
  if (!Number.isFinite(limit) || !limit) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limit)));
}

async function listAllSupportRequestKeys(): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;

  while (true) {
    const page = await kvList(BINDING, {
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
  const requests = await Promise.all(
    pageKeys.map(async (key) => {
      const value = await kvGet<unknown>(BINDING, key);
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
