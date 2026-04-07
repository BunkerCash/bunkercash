/**
 * Rate-limited fetch middleware for Solana RPC connections.
 *
 * This is typed against the installed `@solana/web3.js` FetchMiddleware
 * contract so upstream signature changes fail at compile time.
 */
import type { FetchMiddleware } from "@solana/web3.js";

type FetchContinuation = Parameters<FetchMiddleware>[2];

type QueueItem = {
  info: RequestInfo | URL;
  init: RequestInit | undefined;
  next: FetchContinuation;
};

const REQUEST_INTERVAL_MS = 400; // ~2.5 req/s — safely within devnet limits

export function createRateLimitedFetch(
  intervalMs: number = REQUEST_INTERVAL_MS,
): FetchMiddleware {
  const queue: QueueItem[] = [];
  let draining = false;
  let lastRequestTime = 0;

  async function drain() {
    if (draining) return;
    draining = true;

    try {
      while (true) {
        const item = queue.shift();
        if (!item) break;

        const now = Date.now();
        const elapsed = now - lastRequestTime;
        if (elapsed < intervalMs) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs - elapsed));
        }

        lastRequestTime = Date.now();
        item.next(item.info, item.init);
      }
    } finally {
      draining = false;
      if (queue.length > 0) {
        void drain();
      }
    }
  }

  return (info, init, next) => {
    queue.push({ info, init, next });
    void drain();
  };
}
