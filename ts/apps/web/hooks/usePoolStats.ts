"use client";

import { useCallback, useEffect, useState } from "react";
import type { PoolDataResponse } from "@/lib/solana-server";

export interface PoolStats {
  totalSupply: string | null;
  circulatingSupply: string | null;
  pendingClaimsUsdc: string | null;
  treasuryUsdc: string | null;
  navUsdc: string | null;
  pricePerToken: number | null;
  lastRefreshed: Date | null;
  totalSupplyRaw: number | null;
  circulatingSupplyRaw: number | null;
  pendingClaimsUsdcRaw: number | null;
  treasuryUsdcRaw: number | null;
  navUsdcRaw: number | null;
}

const emptyStats: PoolStats = {
  totalSupply: null,
  circulatingSupply: null,
  pendingClaimsUsdc: null,
  treasuryUsdc: null,
  navUsdc: null,
  pricePerToken: null,
  lastRefreshed: null,
  totalSupplyRaw: null,
  circulatingSupplyRaw: null,
  pendingClaimsUsdcRaw: null,
  treasuryUsdcRaw: null,
  navUsdcRaw: null,
};

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function usePoolStats() {
  const [stats, setStats] = useState<PoolStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pool-data");
      if (!res.ok) throw new Error(`pool-data: ${res.status}`);
      const data: PoolDataResponse = await res.json();

      setStats({
        totalSupply: fmt(data.totalSupplyRaw),
        circulatingSupply: fmt(data.totalSupplyRaw),
        pendingClaimsUsdc: fmt(data.pendingClaimsUsdcRaw),
        treasuryUsdc: data.treasuryUsdcRaw?.toString() ?? null,
        navUsdc: fmt(data.navUsdcRaw),
        pricePerToken: data.pricePerToken,
        lastRefreshed: new Date(data.ts),
        totalSupplyRaw: data.totalSupplyRaw,
        circulatingSupplyRaw: data.totalSupplyRaw,
        pendingClaimsUsdcRaw: data.pendingClaimsUsdcRaw,
        treasuryUsdcRaw: data.treasuryUsdcRaw,
        navUsdcRaw: data.navUsdcRaw,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch pool stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refresh: fetchStats };
}
