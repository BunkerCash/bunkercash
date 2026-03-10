"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getProgram, PROGRAM_ID } from "@/lib/program";
import type { Transaction } from "@/types";

const USDC_DECIMALS = 6;
const BUNKERCASH_DECIMALS = 6;

// IDL discriminators (first 8 bytes of the instruction data)
const DEPOSIT_USDC_DISC = [184, 148, 250, 169, 224, 213, 34, 126];
const FILE_CLAIM_DISC = [187, 254, 40, 13, 146, 223, 230, 97];

interface Stringable {
  toString(): string;
}

interface RawClaimRecord {
  publicKey: PublicKey;
  account: {
    user: PublicKey;
    usdcAmount: Stringable;
    timestamp: Stringable;
    processed: boolean;
    paidAmount: Stringable;
  };
}

function bytesEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Module-level cache so data survives tab switches (component unmount/remount)
let txCache: { key: string; data: Transaction[] } | null = null;

/** Call after a successful buy/sell to force fresh data on next tab visit */
export function invalidateTransactionCache() {
  txCache = null;
}

export function useMyTransactions() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const cacheKey = wallet.publicKey?.toBase58() ?? "";

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    // Restore from cache on mount if same wallet
    return txCache?.key === cacheKey ? txCache.data : [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const program = useMemo(
    () => (wallet.publicKey ? getProgram(connection, wallet) : null),
    [connection, wallet]
  );

  const fetchTransactions = useCallback(async () => {
    if (!wallet.publicKey || !connection) {
      setTransactions([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results: Transaction[] = [];

      // ── 1. Fetch recent deposit/file-claim transactions ────────────
      // Get recent transaction signatures involving this wallet + our program
      // Keep limit small to reduce the number of subsequent parsing calls
      const signatures = await connection.getSignaturesForAddress(
        wallet.publicKey,
        { limit: 20 },
        "confirmed"
      );

      if (signatures.length > 0) {
        // Parse transactions ONE AT A TIME to avoid JSON-RPC batch 429s.
        // Each getParsedTransaction call = 1 HTTP request through the throttle.
        for (const sig of signatures) {
          try {
            const tx = await connection.getParsedTransaction(
              sig.signature,
              { commitment: "confirmed", maxSupportedTransactionVersion: 0 }
            );

            if (!tx?.meta || tx.meta.err) continue;

            const blockTime = tx.blockTime;

            // Check each instruction for our program
            for (const ix of tx.transaction.message.instructions) {
              if (
                "programId" in ix &&
                ix.programId.equals(PROGRAM_ID) &&
                "data" in ix
              ) {
                try {
                  let dataBytes: number[];
                  if (typeof ix.data === "string") {
                    const bs58 = await import("bs58");
                    dataBytes = Array.from(bs58.default.decode(ix.data));
                  } else {
                    continue;
                  }

                  const disc = dataBytes.slice(0, 8);

                  if (bytesEqual(disc, DEPOSIT_USDC_DISC)) {
                    const amountBytes = dataBytes.slice(8, 16);
                    const amountBN = new BN(Buffer.from(amountBytes), "le");
                    const usdcAmount =
                      Number(amountBN.toString()) / 10 ** USDC_DECIMALS;

                    results.push({
                      id: `buy-${sig.signature.slice(0, 8)}`,
                      type: "investment",
                      amount: usdcAmount,
                      timestamp: blockTime
                        ? new Date(blockTime * 1000)
                        : new Date(),
                      txSignature: sig.signature,
                    });
                  } else if (bytesEqual(disc, FILE_CLAIM_DISC)) {
                    const amountBytes = dataBytes.slice(8, 16);
                    const amountBN = new BN(Buffer.from(amountBytes), "le");
                    const tokenAmount =
                      Number(amountBN.toString()) / 10 ** BUNKERCASH_DECIMALS;

                    results.push({
                      id: `sell-${sig.signature.slice(0, 8)}`,
                      type: "withdrawal",
                      amount: 0,
                      tokenAmount,
                      timestamp: blockTime
                        ? new Date(blockTime * 1000)
                        : new Date(),
                      txSignature: sig.signature,
                    });
                  }
                } catch {
                  // Skip unparseable instructions
                }
              }
            }
          } catch (e: unknown) {
            // If a single tx parse fails (rate limit), skip it and continue
            const msg = e instanceof Error ? e.message : String(e ?? "");
            if (msg.includes("429") || msg.includes("Too many requests")) {
              console.warn("[Transactions] Skipping tx due to rate limit:", sig.signature.slice(0, 8));
              continue;
            }
            // For other errors, also skip gracefully
            console.warn("[Transactions] Skipping tx:", sig.signature.slice(0, 8), msg);
          }
        }
      }

      // ── 2. Enrich file-claim history with current claim data ───────
      if (program) {
        try {
          const allClaims = await (program.account as { claim: { all: () => Promise<RawClaimRecord[]> } }).claim.all();
          const myClaims = allClaims.filter(
            (x) => x.account.user.toBase58() === wallet.publicKey!.toBase58()
          );

          for (const claim of myClaims) {
            const requestedUsdc =
              Number(claim.account.usdcAmount?.toString?.() ?? "0") /
              10 ** USDC_DECIMALS;
            const paidUsdc =
              Number(claim.account.paidAmount?.toString?.() ?? "0") /
              10 ** USDC_DECIMALS;
            const createdAt = Number(
              claim.account.timestamp?.toString?.() ?? "0"
            );
            const claimId = claim.publicKey.toBase58().slice(0, 8);

            // Check if we already captured this from raw tx parsing
            const existingIdx = results.findIndex(
              (r) =>
                r.type === "withdrawal" &&
                r.timestamp.getTime() ===
                  (createdAt ? new Date(createdAt * 1000).getTime() : r.timestamp.getTime())
            );

            if (existingIdx >= 0) {
              results[existingIdx].amount = paidUsdc;
            } else {
              results.push({
                id: `claim-${claimId}`,
                type: "withdrawal",
                amount: paidUsdc > 0 ? paidUsdc : requestedUsdc,
                timestamp: createdAt
                  ? new Date(createdAt * 1000)
                  : new Date(),
              });
            }
          }
        } catch (e) {
          console.error("Error enriching claims:", e);
        }
      }

      // Sort by timestamp descending (newest first)
      results.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      );

      txCache = { key: wallet.publicKey!.toBase58(), data: results };
      setTransactions(results);
    } catch (e: unknown) {
      console.error("Error fetching transactions:", e);

      // Show user-friendly message instead of raw JSON
      const msg = e instanceof Error ? e.message : String(e ?? "");
      if (msg.includes("429") || msg.includes("Too many requests")) {
        setError(
          "Rate limited by Solana RPC. Please wait a moment and click Refresh."
        );
      } else {
        setError("Failed to fetch transactions. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [connection, wallet.publicKey, program]);

  useEffect(() => {
    // Skip fetch if we already have cached data for this wallet
    if (txCache?.key === cacheKey && txCache.data.length > 0) return;
    fetchTransactions();
  }, [fetchTransactions, cacheKey]);

  return { transactions, loading, error, refresh: fetchTransactions };
}
