/**
 * Rate-limited fetch middleware for Solana RPC connections.
 *
 * IMPORTANT: `ConnectionConfig.fetchMiddleware` must **return a Response**.
 * If it returns `void`, all RPC calls will fail in the browser with
 * "Failed to fetch".
 */

type FetchLike = (info: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type FetchMiddleware = (info: RequestInfo | URL, init: RequestInit | undefined, fetch: FetchLike) => Promise<Response>

type QueueItem = {
  info: RequestInfo | URL
  init: RequestInit | undefined
  fetch: FetchLike
  resolve: (res: Response) => void
  reject: (err: unknown) => void
}

const REQUEST_INTERVAL_MS = 400 // ~2.5 req/s — safely within devnet limits

const queue: QueueItem[] = []
let draining = false
let lastRequestTime = 0

async function drain(intervalMs: number) {
  if (draining) return
  draining = true

  try {
    while (queue.length > 0) {
      const now = Date.now()
      const elapsed = now - lastRequestTime
      if (elapsed < intervalMs) {
        await new Promise((r) => setTimeout(r, intervalMs - elapsed))
      }

      const item = queue.shift()!
      lastRequestTime = Date.now()

      try {
        const res = await item.fetch(item.info, item.init)
        item.resolve(res)
      } catch (err: unknown) {
        item.reject(err)
      }
    }
  } finally {
    draining = false
  }
}

export function createRateLimitedFetch(intervalMs: number = REQUEST_INTERVAL_MS): FetchMiddleware {
  return (info, init, fetch) =>
    new Promise<Response>((resolve, reject) => {
      queue.push({ info, init, fetch, resolve, reject })
      void drain(intervalMs)
    })
}
