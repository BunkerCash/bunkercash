/**
 * Rate-limited fetch middleware for Solana RPC connections.
 *
 * Solana's public devnet RPC (api.devnet.solana.com) aggressively rate-limits
 * at ~2-3 requests/second. This middleware queues all RPC requests and drains
 * them sequentially with a configurable delay, preventing 429 errors from
 * the many hooks that fire concurrently on page load.
 *
 * See @solana/web3.js ConnectionConfig.fetchMiddleware type:
 *   (info, init, fetch) => void
 * where `fetch(info, init)` is what actually performs the HTTP request.
 */

interface QueueItem {
  info: any;
  init: any;
  doFetch: (info: any, init: any) => void;
}

const REQUEST_INTERVAL_MS = 400; // ~2.5 req/s — safely within devnet limits

let queue: QueueItem[] = [];
let draining = false;
let lastRequestTime = 0;

async function drain() {
  if (draining) return;
  draining = true;

  while (queue.length > 0) {
    // Ensure minimum interval between requests
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < REQUEST_INTERVAL_MS) {
      await new Promise((r) => setTimeout(r, REQUEST_INTERVAL_MS - elapsed));
    }

    const item = queue.shift()!;
    lastRequestTime = Date.now();

    // Delegate to the real fetch provided by @solana/web3.js
    item.doFetch(item.info, item.init);
  }

  draining = false;
}

/**
 * Creates a fetchMiddleware compatible with @solana/web3.js Connection config.
 */
export function createRateLimitedFetch() {
  return (info: any, init: any, doFetch: (info: any, init: any) => void) => {
    queue.push({ info, init, doFetch });
    drain();
  };
}
