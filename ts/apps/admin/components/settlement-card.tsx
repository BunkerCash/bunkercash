"use client";

import { useMemo, useState, useCallback } from "react";
import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { useAllOpenClaims, type OpenClaim } from "@/hooks/useAllOpenClaims";
import { usePayoutVault } from "@/hooks/usePayoutVault";
import {
  getClaimPriceSnapshotPda,
  getPoolPda,
  getPoolSignerPda,
  getProgram,
  PROGRAM_ID,
} from "@/lib/program";
import { getClusterFromEndpoint, getUsdcMintForCluster } from "@/lib/constants";

const USDC_DECIMALS = 6;
const TOKEN_DECIMALS = 9;

interface SettleClaimMethods {
  settleClaim: (payoutAmount: BN) => {
    accounts: (accounts: {
      pool: PublicKey;
      poolSigner: PublicKey;
      admin: PublicKey;
      claim: PublicKey;
      claimPriceSnapshot: PublicKey;
      usdcMint: PublicKey;
      payoutUsdcVault: PublicKey;
      userUsdc: PublicKey;
      usdcTokenProgram: PublicKey;
    }) => {
      instruction: () => Promise<TransactionInstruction>;
    };
  };
}

interface ProviderLike {
  sendAndConfirm: (tx: Transaction) => Promise<string>;
}

interface SettlementItem {
  claim: OpenClaim;
  owed: bigint;
  remaining: bigint;
  payout: bigint;
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

function truncateWallet(wallet: string): string {
  if (wallet.length <= 12) return wallet;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

function isFirstDayOfMonth(): boolean {
  return new Date().getDate() === 1;
}

function getMonthLabel(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function SettlementCard() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { claims, loading: claimsLoading, error: claimsError, refresh: refreshClaims } = useAllOpenClaims();
  const { balance: vaultBalance, loading: vaultLoading, refresh: refreshVault } = usePayoutVault();

  const [settling, setSettling] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<{ succeeded: number; failed: number; signatures: string[] } | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [bypassDateCheck, setBypassDateCheck] = useState(false);

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), []);
  const poolSignerPda = useMemo(() => getPoolSignerPda(poolPda, PROGRAM_ID), [poolPda]);
  const program = useMemo(
    () => (wallet.publicKey ? getProgram(connection, wallet) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connection, wallet.publicKey]
  );
  const cluster = useMemo(
    () => getClusterFromEndpoint(connection.rpcEndpoint ?? ""),
    [connection]
  );
  const usdcMint = useMemo(() => getUsdcMintForCluster(cluster), [cluster]);

  // Compute settlement plan
  const settlementPlan = useMemo((): SettlementItem[] => {
    if (!claims.length || !vaultBalance) return [];

    const vaultRaw = BigInt(Math.floor(parseFloat(vaultBalance) * 10 ** USDC_DECIMALS));
    if (vaultRaw === BigInt(0)) return [];

    const items: SettlementItem[] = claims
      .filter((c) => !c.isClosed && c.priceUsdcPerTokenSnapshot)
      .map((claim) => {
        const price = BigInt(claim.priceUsdcPerTokenSnapshot!);
        const owed = (BigInt(claim.tokenAmountLocked) * price) / BigInt(10 ** TOKEN_DECIMALS);
        const paid = BigInt(claim.usdcPaid);
        const remaining = owed > paid ? owed - paid : BigInt(0);
        return { claim, owed, remaining, payout: BigInt(0) };
      })
      .filter((item) => item.remaining > BigInt(0));

    if (items.length === 0) return [];

    const totalRemaining = items.reduce((sum, item) => sum + item.remaining, BigInt(0));

    if (vaultRaw >= totalRemaining) {
      // Enough to pay everyone in full
      return items.map((item) => ({ ...item, payout: item.remaining }));
    }

    // Proportional distribution
    const result: SettlementItem[] = [];
    let distributed = BigInt(0);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let payout: bigint;

      if (i === items.length - 1) {
        // Last item gets remainder to avoid rounding dust
        payout = vaultRaw - distributed;
      } else {
        payout = (item.remaining * vaultRaw) / totalRemaining;
      }

      // Cap to remaining and ensure non-negative
      payout = payout > item.remaining ? item.remaining : payout;
      payout = payout < BigInt(0) ? BigInt(0) : payout;

      distributed += payout;
      result.push({ ...item, payout });
    }

    return result.filter((item) => item.payout > BigInt(0));
  }, [claims, vaultBalance]);

  const totalPayout = useMemo(
    () => settlementPlan.reduce((sum, item) => sum + item.payout, BigInt(0)),
    [settlementPlan]
  );
  const totalRemaining = useMemo(
    () => settlementPlan.reduce((sum, item) => sum + item.remaining, BigInt(0)),
    [settlementPlan]
  );
  const payoutRatio = totalRemaining > BigInt(0)
    ? Math.round(Number((totalPayout * BigInt(10000)) / totalRemaining)) / 100
    : 0;

  const canSettle = (isFirstDayOfMonth() || bypassDateCheck) && settlementPlan.length > 0 && !settling;

  const handleSettleAll = useCallback(async () => {
    if (!program || !wallet.publicKey || !usdcMint || settlementPlan.length === 0) return;

    setSettling(true);
    setTxError(null);
    setResults(null);
    setProgress({ current: 0, total: settlementPlan.length });

    const succeeded: string[] = [];
    let failed = 0;

    const payoutUsdcVault = getAssociatedTokenAddressSync(
      usdcMint,
      poolSignerPda,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    for (let i = 0; i < settlementPlan.length; i++) {
      const item = settlementPlan[i];
      setProgress({ current: i + 1, total: settlementPlan.length });

      try {
        const userUsdcAta = getAssociatedTokenAddressSync(
          usdcMint,
          item.claim.user,
          false,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const ensureUserAtaIx = createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          userUsdcAta,
          item.claim.user,
          usdcMint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const claimPriceSnapshotPda = getClaimPriceSnapshotPda(item.claim.pubkey, PROGRAM_ID);

        const settleIx = await (
          (program.methods as unknown as SettleClaimMethods)
            .settleClaim(new BN(item.payout.toString()))
            .accounts({
              pool: poolPda,
              poolSigner: poolSignerPda,
              admin: wallet.publicKey,
              claim: item.claim.pubkey,
              claimPriceSnapshot: claimPriceSnapshotPda,
              usdcMint,
              payoutUsdcVault,
              userUsdc: userUsdcAta,
              usdcTokenProgram: TOKEN_PROGRAM_ID,
            })
            .instruction()
        );

        const tx = new Transaction().add(ensureUserAtaIx, settleIx);
        const sig = await (program.provider as ProviderLike).sendAndConfirm(tx);
        succeeded.push(sig);
      } catch (e: unknown) {
        console.error(`Failed to settle claim #${item.claim.id}:`, e);
        failed++;
      }
    }

    setResults({ succeeded: succeeded.length, failed, signatures: succeeded });
    setSettling(false);
    refreshClaims();
    refreshVault();
  }, [program, wallet.publicKey, usdcMint, settlementPlan, poolPda, poolSignerPda, refreshClaims, refreshVault]);

  const loading = claimsLoading || vaultLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-xl font-semibold text-white">Monthly Settlement</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Proportional claim distribution for {getMonthLabel()}
          </p>
        </div>
        <button
          onClick={() => { refreshClaims(); refreshVault(); }}
          disabled={loading}
          className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800/40 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-2">
            Vault Balance
          </div>
          <p className="text-white text-lg font-mono font-semibold">
            {vaultLoading ? "..." : `$${vaultBalance ?? "0"}`}
          </p>
          <p className="text-xs text-neutral-500 mt-1">USDC available</p>
        </div>
        <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-2">
            Open Claims
          </div>
          <p className="text-white text-lg font-semibold">{settlementPlan.length}</p>
          <p className="text-xs text-neutral-500 mt-1">eligible for settlement</p>
        </div>
        <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-2">
            Total Owed
          </div>
          <p className="text-white text-lg font-mono font-semibold">
            ${formatUsdc(totalRemaining)}
          </p>
          <p className="text-xs text-neutral-500 mt-1">across all open claims</p>
        </div>
        <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-2">
            Payout Ratio
          </div>
          <p className={`text-lg font-semibold ${payoutRatio >= 100 ? "text-[#00FFB2]" : "text-amber-400"}`}>
            {payoutRatio}%
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            {payoutRatio >= 100 ? "full payout" : "proportional distribution"}
          </p>
        </div>
      </div>

      {/* Warnings */}
      {!wallet.publicKey && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <Wallet className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-400">
            Connect the admin wallet (or Squads vault) to process settlements.
          </p>
        </div>
      )}

      {!isFirstDayOfMonth() && !bypassDateCheck && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <Calendar className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-400">
              Settlements are scheduled for the 1st of each month. Today is the {new Date().getDate()}th.
            </p>
            <button
              onClick={() => setBypassDateCheck(true)}
              className="mt-2 text-xs text-amber-300 underline underline-offset-2 hover:text-amber-200"
            >
              Override and settle anyway
            </button>
          </div>
        </div>
      )}

      {claimsError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{claimsError}</p>
          </div>
        </div>
      )}

      {txError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{txError}</p>
          </div>
        </div>
      )}

      {results && (
        <div className={`rounded-xl p-4 border ${
          results.failed === 0
            ? "bg-emerald-500/10 border-emerald-500/30"
            : "bg-amber-500/10 border-amber-500/30"
        }`}>
          <div className="flex items-start gap-3">
            <CheckCircle2 className={`w-5 h-5 shrink-0 mt-0.5 ${
              results.failed === 0 ? "text-emerald-400" : "text-amber-400"
            }`} />
            <div>
              <p className={`text-sm font-medium ${
                results.failed === 0 ? "text-emerald-300" : "text-amber-300"
              }`}>
                Settlement complete: {results.succeeded} succeeded, {results.failed} failed
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                Total distributed: ${formatUsdc(totalPayout)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Settlement progress */}
      {settling && (
        <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="w-5 h-5 text-[#00FFB2] animate-spin" />
            <p className="text-sm text-white font-medium">
              Processing claim {progress.current} of {progress.total}...
            </p>
          </div>
          <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#00FFB2] rounded-full transition-all duration-300"
              style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Settle All button */}
      {settlementPlan.length > 0 && (
        <button
          onClick={handleSettleAll}
          disabled={!canSettle || !wallet.publicKey}
          className="w-full h-12 rounded-xl bg-[#00FFB2] text-black text-sm font-semibold hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600 transition-colors flex items-center justify-center gap-2"
        >
          {settling ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Settling {progress.current}/{progress.total}...
            </>
          ) : (
            `Settle All Claims — $${formatUsdc(totalPayout)} USDC`
          )}
        </button>
      )}

      {/* Settlement plan table */}
      <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-800/60 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-white">Settlement Plan</h2>
            <p className="text-xs text-neutral-500 mt-1">
              {payoutRatio >= 100
                ? "Full payout for all claims"
                : `Proportional distribution at ${payoutRatio}% of owed amounts`}
            </p>
          </div>
          <span className="text-xs text-neutral-500">{settlementPlan.length} claims</span>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-neutral-500">Loading claims...</div>
        ) : settlementPlan.length === 0 ? (
          <div className="p-6 text-sm text-neutral-500">
            No eligible claims for settlement.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800/40">
                <th className="text-left px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Claim
                </th>
                <th className="text-left px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Wallet
                </th>
                <th className="text-right px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Locked
                </th>
                <th className="text-right px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Remaining
                </th>
                <th className="text-right px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Payout
                </th>
                <th className="text-right px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {settlementPlan.map((item) => {
                const claimPayoutPct = item.remaining > BigInt(0)
                  ? Math.round(Number((item.payout * BigInt(10000)) / item.remaining)) / 100
                  : 0;

                return (
                  <tr
                    key={item.claim.pubkey.toBase58()}
                    className="border-b border-neutral-800/30 last:border-b-0"
                  >
                    <td className="px-5 py-3 text-sm font-mono text-white">#{item.claim.id}</td>
                    <td className="px-5 py-3 text-sm font-mono text-neutral-300">
                      {truncateWallet(item.claim.user.toBase58())}
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-right text-neutral-400">
                      {formatTokenAmount(item.claim.tokenAmountLocked)} BNKR
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-right text-neutral-300">
                      ${formatUsdc(item.remaining)}
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-right text-[#00FFB2] font-semibold">
                      ${formatUsdc(item.payout)}
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-right text-neutral-500">
                      {claimPayoutPct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-700/60">
                <td colSpan={3} className="px-5 py-3 text-sm font-medium text-neutral-400">
                  Total
                </td>
                <td className="px-5 py-3 text-sm font-mono text-right text-neutral-300 font-medium">
                  ${formatUsdc(totalRemaining)}
                </td>
                <td className="px-5 py-3 text-sm font-mono text-right text-[#00FFB2] font-semibold">
                  ${formatUsdc(totalPayout)}
                </td>
                <td className="px-5 py-3 text-sm font-mono text-right text-neutral-500">
                  {payoutRatio}%
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
