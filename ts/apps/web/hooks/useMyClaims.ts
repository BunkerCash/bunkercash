"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClaimsResponse, SerializedClaim } from "@/lib/solana-server";
import { useOptionalWallet } from "@/hooks/useOptionalWallet";

export type Claim = SerializedClaim;

export function useMyClaims() {
  const wallet = useOptionalWallet();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClaims = useCallback(async () => {
    if (!wallet?.publicKey) {
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
      const mine = allClaims
        .filter((c) => c.user === userKey)
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));

      setClaims(mine);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch claims");
    } finally {
      setLoading(false);
    }
  }, [wallet?.publicKey]);

  useEffect(() => {
    void fetchClaims();
  }, [fetchClaims]);

  return { claims, loading, error, refreshClaims: fetchClaims };
}
