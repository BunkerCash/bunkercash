"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { getBunkercashMintPda, PROGRAM_ID } from "@/lib/program";
import type { BalanceResponse } from "@/lib/solana-server";
import { useOptionalWallet } from "@/hooks/useOptionalWallet";

export function useTokenBalance() {
  const wallet = useOptionalWallet();
  const publicKey = wallet?.publicKey ?? null;
  const [balance, setBalance] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mintPda = useMemo(() => getBunkercashMintPda(PROGRAM_ID), []);

  const userBunkercashAta = useMemo(() => {
    if (!publicKey) return null;
    return getAssociatedTokenAddressSync(
      mintPda,
      publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
  }, [publicKey, mintPda]);

  const fetchBalance = useCallback(async () => {
    if (!publicKey) {
      setBalance("0");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/balance?wallet=${publicKey.toBase58()}`,
      );
      if (!res.ok) throw new Error(`balance: ${res.status}`);
      const data: BalanceResponse = await res.json();
      setBalance(data.balance);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch balance");
      setBalance("0");
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return { balance, loading, error, refreshBalance: fetchBalance, userBunkercashAta };
}
