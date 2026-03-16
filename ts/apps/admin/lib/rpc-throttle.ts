interface QueueItem {
  info: RequestInfo | URL;
  init: RequestInit | undefined;
  doFetch: (info: RequestInfo | URL, init: RequestInit | undefined) => void;
}

const REQUEST_INTERVAL_MS = 400;
const DEFAULT_RETRY_DELAYS_MS = [500, 1_000, 1_500];

const queue: QueueItem[] = [];
let draining = false;
let lastRequestTime = 0;

async function drain() {
  if (draining) return;
  draining = true;

  while (queue.length > 0) {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < REQUEST_INTERVAL_MS) {
      await new Promise((r) => setTimeout(r, REQUEST_INTERVAL_MS - elapsed));
    }

    const item = queue.shift();
    if (!item) break;
    lastRequestTime = Date.now();
    item.doFetch(item.info, item.init);
  }

  draining = false;
}

export function createRateLimitedFetch() {
  return (
    info: RequestInfo | URL,
    init: RequestInit | undefined,
    doFetch: (info: RequestInfo | URL, init: RequestInit | undefined) => void
  ) => {
    queue.push({ info, init, doFetch });
    void drain();
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRateLimitRpcError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes("429") ||
    message.includes("too many requests") ||
    message.includes("rate limit")
  );
}

export async function withRateLimitRetry<T>(
  operation: () => Promise<T>,
  retryDelaysMs: number[] = DEFAULT_RETRY_DELAYS_MS
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRateLimitRpcError(error) || attempt === retryDelaysMs.length) {
        throw error;
      }
      await sleep(retryDelaysMs[attempt]!);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("RPC request failed");
}
