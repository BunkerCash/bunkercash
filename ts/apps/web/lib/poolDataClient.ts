import type { PoolDataResponse } from "@/lib/solana-server";

// Module-level cache of the last /api/pool-data response. Survives component
// unmount/remount (tab switches, modal open/close) so consumers can render the
// last known pool state immediately and revalidate in the background instead
// of showing a full loading state every time.
let cache: PoolDataResponse | null = null;
let inflight: Promise<PoolDataResponse> | null = null;

export function getCachedPoolData(): PoolDataResponse | null {
  return cache;
}

// Fetches /api/pool-data, de-duplicating concurrent callers onto a single
// request. The server route is itself KV-cached, so this is cheap.
export async function fetchPoolDataCached(): Promise<PoolDataResponse> {
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch("/api/pool-data");
      if (!res.ok) throw new Error(`pool-data: ${res.status}`);
      const data: PoolDataResponse = await res.json();
      cache = data;
      return data;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
