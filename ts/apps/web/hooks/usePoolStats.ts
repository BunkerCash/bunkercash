"use client";

import { useCallback, useEffect, useState } from "react";
import type { PoolDataResponse } from "@/lib/solana-server";
import { fetchPoolDataCached, getCachedPoolData } from "@/lib/poolDataClient";

export interface PoolStats {
  totalSupply: string | null;
  circulatingSupply: string | null;
  pendingClaimsUsdc: string | null;
  treasuryUsdc: string | null;
  navUsdc: string | null;
  minClaimUsdc: string | null;
  purchaseLimitUsdc: string | null;
  totalDepositedUsdc: string | null;
  remainingPurchaseCapacityUsdc: string | null;
  pricePerToken: number | null;
  lastRefreshed: Date | null;
  adminWallet: string | null;
  purchaseFeeBps: number | null;
  claimFeeBps: number | null;
  totalSupplyRaw: number | null;
  circulatingSupplyRaw: number | null;
  pendingClaimsUsdcRaw: number | null;
  treasuryUsdcRaw: number | null;
  navUsdcRaw: number | null;
  minClaimUsdcRaw: number | null;
  purchaseLimitUsdcRaw: number | null;
  totalDepositedUsdcRaw: number | null;
  remainingPurchaseCapacityUsdcRaw: number | null;
}

const emptyStats: PoolStats = {
  totalSupply: null,
  circulatingSupply: null,
  pendingClaimsUsdc: null,
  treasuryUsdc: null,
  navUsdc: null,
  minClaimUsdc: null,
  purchaseLimitUsdc: null,
  totalDepositedUsdc: null,
  remainingPurchaseCapacityUsdc: null,
  pricePerToken: null,
  lastRefreshed: null,
  adminWallet: null,
  purchaseFeeBps: null,
  claimFeeBps: null,
  totalSupplyRaw: null,
  circulatingSupplyRaw: null,
  pendingClaimsUsdcRaw: null,
  treasuryUsdcRaw: null,
  navUsdcRaw: null,
  minClaimUsdcRaw: null,
  purchaseLimitUsdcRaw: null,
  totalDepositedUsdcRaw: null,
  remainingPurchaseCapacityUsdcRaw: null,
};

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function mapPoolData(data: PoolDataResponse): PoolStats {
  return {
    totalSupply: fmt(data.totalSupplyRaw),
    circulatingSupply: fmt(data.circulatingSupplyRaw),
    pendingClaimsUsdc: fmt(data.pendingClaimsUsdcRaw),
    treasuryUsdc: data.treasuryUsdcRaw != null ? fmt(data.treasuryUsdcRaw) : null,
    navUsdc: fmt(data.navUsdcRaw),
    minClaimUsdc:
      data.minClaimUsdcRaw != null ? fmt(data.minClaimUsdcRaw) : null,
    purchaseLimitUsdc:
      data.purchaseLimitUsdcRaw != null ? fmt(data.purchaseLimitUsdcRaw) : null,
    totalDepositedUsdc:
      data.totalDepositedUsdcRaw != null ? fmt(data.totalDepositedUsdcRaw) : null,
    remainingPurchaseCapacityUsdc:
      data.remainingPurchaseCapacityUsdcRaw != null
        ? fmt(data.remainingPurchaseCapacityUsdcRaw)
        : null,
    pricePerToken: data.pricePerToken,
    lastRefreshed: new Date(data.ts),
    adminWallet: data.adminWallet,
    purchaseFeeBps: data.purchaseFeeBps,
    claimFeeBps: data.claimFeeBps,
    totalSupplyRaw: data.totalSupplyRaw,
    circulatingSupplyRaw: data.circulatingSupplyRaw,
    pendingClaimsUsdcRaw: data.pendingClaimsUsdcRaw,
    treasuryUsdcRaw: data.treasuryUsdcRaw,
    navUsdcRaw: data.navUsdcRaw,
    minClaimUsdcRaw: data.minClaimUsdcRaw,
    purchaseLimitUsdcRaw: data.purchaseLimitUsdcRaw,
    totalDepositedUsdcRaw: data.totalDepositedUsdcRaw,
    remainingPurchaseCapacityUsdcRaw: data.remainingPurchaseCapacityUsdcRaw,
  };
}

export function usePoolStats() {
  // Seed from the shared cache so tab/page re-mounts render the last known
  // values immediately instead of flashing a full loading state.
  const [stats, setStats] = useState<PoolStats>(() => {
    const cached = getCachedPoolData();
    return cached ? mapPoolData(cached) : emptyStats;
  });
  // `loading` = no data to show yet (first ever load). `refreshing` = we have
  // cached data on screen and are revalidating in the background.
  const [loading, setLoading] = useState(() => getCachedPoolData() == null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    const hasData = getCachedPoolData() != null;
    if (hasData) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await fetchPoolDataCached();
      setStats(mapPoolData(data));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch pool stats");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  return { stats, loading, refreshing, error, refresh: fetchStats };
}
