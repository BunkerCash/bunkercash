"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClaimsResponse, SerializedClaim } from "@/lib/solana-server";
import { useOptionalWallet } from "@/hooks/useOptionalWallet";

export type Claim = SerializedClaim;

let claimsCache: { key: string; data: Claim[] } | null = null;
const cancelledClaimOverrides = new Set<string>();

function applyClaimOverrides(claims: Claim[]): Claim[] {
  return claims.map((claim) =>
    cancelledClaimOverrides.has(claim.pubkey)
      ? {
          ...claim,
          cancelled: true,
          remainingUsdc: "0",
          bunkercashRemaining: "0",
        }
      : claim,
  );
}

export function markClaimCancelledOptimistic(claimPubkey: string) {
  cancelledClaimOverrides.add(claimPubkey);
  if (!claimsCache) return;
  claimsCache = {
    ...claimsCache,
    data: applyClaimOverrides(claimsCache.data),
  };
}

export function useMyClaims() {
  const wallet = useOptionalWallet();
  const cacheKey = wallet?.publicKey?.toBase58() ?? "";
  const [claims, setClaims] = useState<Claim[]>(() =>
    claimsCache?.key === cacheKey ? claimsCache.data : [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClaims = useCallback(async () => {
    if (!wallet?.publicKey) {
      claimsCache = null;
      setClaims([]);
      return;
    }

    const userKey = wallet.publicKey.toBase58();

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/claims");
      if (!res.ok) throw new Error(`claims: ${res.status}`);
      const data: ClaimsResponse = await res.json();

      const allClaims = [...data.open, ...data.closed];
      const mine = applyClaimOverrides(
        allClaims
        .filter((c) => c.user === userKey)
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt)),
      );

      claimsCache = { key: userKey, data: mine };
      setClaims(mine);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch claims");
    } finally {
      setLoading(false);
    }
  }, [wallet?.publicKey]);

  useEffect(() => {
    if (claimsCache?.key === cacheKey) {
      setClaims(claimsCache.data);
    }
    void fetchClaims();
  }, [fetchClaims, cacheKey]);

  return { claims, loading, error, refreshClaims: fetchClaims };
}
