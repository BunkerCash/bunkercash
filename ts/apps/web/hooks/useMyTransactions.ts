"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { Transaction } from "@/types";
import type { TransactionsResponse } from "@/lib/solana-server";

// Module-level cache so data survives tab switches (component unmount/remount)
let txCache: { key: string; data: Transaction[] } | null = null;

/** Call after a successful buy/sell to force fresh data on next tab visit */
export function invalidateTransactionCache() {
  txCache = null;
}

export function useMyTransactions() {
  const wallet = useWallet();
  const cacheKey = wallet.publicKey?.toBase58() ?? "";

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    return txCache?.key === cacheKey ? txCache.data : [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    if (!wallet.publicKey) {
      setTransactions([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/transactions?wallet=${wallet.publicKey.toBase58()}`,
      );
      if (!res.ok) throw new Error(`transactions: ${res.status}`);
      const data: TransactionsResponse = await res.json();

      const parsed: Transaction[] = data.transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        tokenAmount: tx.tokenAmount,
        timestamp: new Date(tx.timestamp),
        txSignature: tx.txSignature,
      }));

      txCache = { key: wallet.publicKey!.toBase58(), data: parsed };
      setTransactions(parsed);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? "");
      if (msg.includes("429") || msg.includes("Too many requests")) {
        setError(
          "Rate limited by Solana RPC. Please wait a moment and click Refresh.",
        );
      } else {
        setError("Failed to fetch transactions. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey]);

  useEffect(() => {
    if (txCache?.key === cacheKey && txCache.data.length > 0) return;
    fetchTransactions();
  }, [fetchTransactions, cacheKey]);

  return { transactions, loading, error, refresh: fetchTransactions };
}
