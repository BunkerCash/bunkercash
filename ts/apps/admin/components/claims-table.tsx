"use client";

import { useState, useMemo, useCallback, useEffect, Fragment } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { ChevronRight, Loader2, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAllOpenClaims, type OpenClaim } from "@/hooks/useAllOpenClaims";
import { usePayoutVault } from "@/hooks/usePayoutVault";
import {
  getProgram,
  getPoolPda,
  getPoolSignerPda,
  PROGRAM_ID,
} from "@/lib/program";
import { getClusterFromEndpoint, getUsdcMintForCluster } from "@/lib/constants";

const USDC_DECIMALS = 6;
const TOKEN_DECIMALS = 9;

function truncateWallet(wallet: string): string {
  if (wallet.length <= 12) return wallet;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

function formatUsdc(raw: bigint): string {
  if (raw === BigInt(0)) return "0.00";
  const s = raw.toString().padStart(USDC_DECIMALS + 1, "0");
  const head = s.slice(0, -USDC_DECIMALS);
  const tail = s.slice(-USDC_DECIMALS).slice(0, 2).padEnd(2, "0");
  return `${head}.${tail}`;
}

function formatTokenAmount(raw: string): string {
  const s = raw.padStart(TOKEN_DECIMALS + 1, "0");
  const head = s.slice(0, -TOKEN_DECIMALS);
  const tail = s.slice(-TOKEN_DECIMALS).replace(/0+$/, "");
  return tail.length ? `${head}.${tail}` : head;
}

function formatDate(timestamp: string): string {
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export function ClaimsTable() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { claims, closedClaims, loading, error, refresh } = useAllOpenClaims();
  const { balance: vaultBalance, loading: vaultLoading, refresh: refreshVault } = usePayoutVault();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [recentlyPaidPubkeys, setRecentlyPaidPubkeys] = useState<Set<string>>(new Set());
  const [txError, setTxError] = useState<string | null>(null);
  const [poolPrice, setPoolPrice] = useState<bigint | null>(null);

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), []);
  const poolSignerPda = useMemo(() => getPoolSignerPda(poolPda, PROGRAM_ID), [poolPda]);

  const program = useMemo(
    () => (wallet.publicKey ? getProgram(connection, wallet) : null),
    [connection, wallet]
  );

  const usdcMint = useMemo(() => {
    if (!connection) return null;
    const endpoint = (connection as any).rpcEndpoint ?? "";
    const cluster = getClusterFromEndpoint(endpoint);
    return getUsdcMintForCluster(cluster);
  }, [connection]);

  const fetchPoolPrice = useCallback(async () => {
    if (!program) return;
    try {
      const pool = await (program.account as any).poolState.fetch(poolPda);
      setPoolPrice(BigInt(pool.priceUsdcPerToken.toString()));
    } catch (e) {
      console.error("Error fetching pool price:", e);
    }
  }, [program, poolPda]);

  useEffect(() => {
    fetchPoolPrice();
  }, [fetchPoolPrice]);

  const computeOwed = (tokenAmountLocked: string): bigint => {
    if (!poolPrice) return BigInt(0);
    return (BigInt(tokenAmountLocked) * poolPrice) / BigInt(10 ** TOKEN_DECIMALS);
  };

  const openClaims = useMemo(
    () => claims.filter((c) => !recentlyPaidPubkeys.has(c.pubkey.toBase58())),
    [claims, recentlyPaidPubkeys]
  );

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleProcessClaim = async (claim: OpenClaim) => {
    if (!program || !wallet.publicKey || !usdcMint) return;
    if (recentlyPaidPubkeys.has(claim.pubkey.toBase58())) return;

    setProcessingId(claim.id);
    setTxError(null);

    try {
      const payoutUsdcVault = getAssociatedTokenAddressSync(
        usdcMint,
        poolSignerPda,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const userUsdcAta = getAssociatedTokenAddressSync(
        usdcMint,
        claim.user,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const ataIx = createAssociatedTokenAccountIdempotentInstruction(
        wallet.publicKey,
        userUsdcAta,
        claim.user,
        usdcMint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const processIx = await (program.methods as any)
        .processClaim()
        .accounts({
          pool: poolPda,
          poolSigner: poolSignerPda,
          admin: wallet.publicKey,
          claim: claim.pubkey,
          payoutUsdcVault,
          userUsdc: userUsdcAta,
          usdcTokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      const tx = new Transaction();
      tx.add(ataIx);
      tx.add(processIx);

      await (
        program.provider as { sendAndConfirm: (tx: Transaction) => Promise<string> }
      ).sendAndConfirm(tx);

      setRecentlyPaidPubkeys((prev) => new Set(prev).add(claim.pubkey.toBase58()));
      refresh();
      refreshVault();
    } catch (e: any) {
      console.error("Error processing claim:", e);
      setTxError(e.message || "Failed to process claim");
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-white">Claims & Payouts</h1>
          <div className="flex items-center gap-4">
            <div className="h-4 w-36 bg-neutral-800/60 rounded animate-pulse" />
            <div className="h-4 w-20 bg-neutral-800/60 rounded animate-pulse" />
          </div>
        </div>
        <div className="border border-neutral-800/60 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-neutral-800/60 bg-neutral-900/20">
            <div className="h-3 w-28 bg-neutral-800/60 rounded animate-pulse" />
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800/60">
                <th className="w-10 px-3 py-3.5" />
                <th className="text-left px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Wallet</th>
                <th className="text-right px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Locked</th>
                <th className="text-right px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Paid</th>
                <th className="text-right px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Remaining</th>
                <th className="text-right px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Progress</th>
                <th className="text-center px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-neutral-800/40 last:border-b-0">
                  <td className="px-3 py-3.5"><div className="h-4 w-4 bg-neutral-800/60 rounded animate-pulse" /></td>
                  <td className="px-5 py-3.5"><div className="h-4 w-24 bg-neutral-800/60 rounded animate-pulse" /></td>
                  <td className="px-5 py-3.5"><div className="h-4 w-20 bg-neutral-800/60 rounded animate-pulse ml-auto" /></td>
                  <td className="px-5 py-3.5"><div className="h-4 w-20 bg-neutral-800/60 rounded animate-pulse ml-auto" /></td>
                  <td className="px-5 py-3.5"><div className="h-4 w-20 bg-neutral-800/60 rounded animate-pulse ml-auto" /></td>
                  <td className="px-5 py-3.5"><div className="h-2 w-20 bg-neutral-800/60 rounded-full animate-pulse ml-auto" /></td>
                  <td className="px-5 py-3.5"><div className="h-7 w-14 bg-neutral-800/60 rounded-lg animate-pulse mx-auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-300 mb-1">Failed to load claims</p>
            <p className="text-xs text-red-200/60">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Claims & Payouts</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-neutral-500">
            Vault:{" "}
            <span className="text-[#00FFB2] font-medium font-mono">
              {vaultLoading ? <span className="inline-block h-4 w-20 bg-neutral-800/60 rounded animate-pulse align-middle" /> : `$${vaultBalance ?? "0"} USDC`}
            </span>
          </span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-neutral-400">
              Open:{" "}
              <span className="text-emerald-400 font-medium">{openClaims.length}</span>
            </span>
            <span className="text-neutral-400">
              Closed:{" "}
              <span className="text-white font-medium">{closedClaims.length}</span>
            </span>
          </div>
          <button
            onClick={() => { refresh(); refreshVault(); }}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800/40 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Wallet warning */}
      {!wallet.publicKey && (
        <div className="flex items-center gap-3 px-4 py-3 mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-400">
            Connect your admin wallet to process claims
          </p>
        </div>
      )}

      {/* Transaction error */}
      {txError && (
        <div className="flex items-center gap-3 px-4 py-3 mb-4 rounded-xl border border-red-500/20 bg-red-500/5">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-400">{txError}</p>
        </div>
      )}

      {openClaims.length === 0 && closedClaims.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-neutral-500 border border-neutral-800/60 rounded-xl">
          <CheckCircle2 className="w-8 h-8 mb-2 text-neutral-700" />
          <p className="text-sm">No claims found on-chain</p>
        </div>
      ) : (
        <>
          {/* Open claims */}
          {openClaims.length > 0 && (
            <div className="border border-neutral-800/60 rounded-xl overflow-hidden mb-6">
              <div className="px-5 py-3 border-b border-neutral-800/60 bg-neutral-900/20">
                <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Open Claims ({openClaims.length})
                </span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-800/60">
                    <th className="w-10 px-3 py-3.5" />
                    <th className="text-left px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                      Wallet
                    </th>
                    <th className="text-right px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                      Locked
                    </th>
                    <th className="text-right px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                      Paid
                    </th>
                    <th className="text-right px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                      Remaining
                    </th>
                    <th className="text-right px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                      Progress
                    </th>
                    <th className="text-center px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {openClaims.map((claim) => {
                    const isExpanded = expandedIds.has(claim.id);
                    const owed = computeOwed(claim.tokenAmountLocked);
                    const paid = BigInt(claim.usdcPaid);
                    const remaining = owed > paid ? owed - paid : BigInt(0);
                    const progress =
                      owed > BigInt(0)
                        ? Math.round((Number(paid) / Number(owed)) * 100)
                        : 100;
                    const isProcessing = processingId === claim.id;

                    return (
                      <Fragment key={claim.id}>
                        <tr
                          className={cn(
                            "border-b border-neutral-800/40 last:border-b-0 hover:bg-neutral-900/30 transition-colors cursor-pointer",
                            isExpanded && "border-b-0"
                          )}
                          onClick={() => toggleExpanded(claim.id)}
                        >
                          <td className="px-3 py-3.5">
                            <ChevronRight
                              className={cn(
                                "w-4 h-4 text-neutral-600 transition-transform duration-200",
                                isExpanded && "rotate-90"
                              )}
                            />
                          </td>
                          <td className="px-5 py-3.5 text-sm text-neutral-300 font-mono">
                            {truncateWallet(claim.user.toBase58())}
                          </td>
                          <td className="px-5 py-3.5 text-sm text-right text-neutral-200 font-mono">
                            {formatTokenAmount(claim.tokenAmountLocked)}{" "}
                            <span className="text-neutral-500">BNKR</span>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-right font-mono">
                            <span className="text-amber-400">${formatUsdc(paid)}</span>{" "}
                            <span className="text-neutral-500">USDC</span>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-right font-mono">
                            <span className="text-emerald-400">${formatUsdc(remaining)}</span>{" "}
                            <span className="text-neutral-500">USDC</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-end gap-3">
                              <div className="w-20 h-2 bg-neutral-800 rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all duration-500",
                                    progress === 100 ? "bg-emerald-400" : "bg-[#00FFB2]"
                                  )}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <span className="text-xs text-neutral-500 font-mono w-8 text-right">
                                {progress}%
                              </span>
                            </div>
                          </td>
                          <td
                            className="px-5 py-3.5 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => handleProcessClaim(claim)}
                              disabled={
                                isProcessing || !wallet.publicKey || remaining === BigInt(0)
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#00FFB2] hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600 text-black transition-all"
                            >
                              {isProcessing && <Loader2 className="w-3 h-3 animate-spin" />}
                              {isProcessing ? "Paying..." : "Pay"}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${claim.id}-details`} className="border-b border-neutral-800/40">
                            <td colSpan={7} className="px-8 pb-4 pt-2">
                              <div className="flex items-center gap-6 text-xs text-neutral-500">
                                <span>Claim #{claim.id}</span>
                                <span>Created: {formatDate(claim.createdAt)}</span>
                                <span className="font-mono text-neutral-600">
                                  {claim.pubkey.toBase58().slice(0, 20)}...
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Closed claims */}
          {closedClaims.length > 0 && (
            <div className="border border-neutral-800/60 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-neutral-800/60 bg-neutral-900/20">
                <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Claim History ({closedClaims.length})
                </span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-800/60">
                    <th className="text-left px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                      Wallet
                    </th>
                    <th className="text-right px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                      Locked
                    </th>
                    <th className="text-right px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                      USDC Paid
                    </th>
                    <th className="text-center px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {closedClaims.map((claim) => (
                    <tr
                      key={claim.id}
                      className="border-b border-neutral-800/40 last:border-b-0"
                    >
                      <td className="px-5 py-3.5 text-sm text-neutral-500 font-mono">
                        {truncateWallet(claim.user.toBase58())}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-right text-neutral-500 font-mono">
                        {formatTokenAmount(claim.tokenAmountLocked)}{" "}
                        <span className="text-neutral-600">BNKR</span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-right font-mono text-neutral-400">
                        ${formatUsdc(BigInt(claim.usdcPaid))}{" "}
                        <span className="text-neutral-600">USDC</span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          Paid
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
