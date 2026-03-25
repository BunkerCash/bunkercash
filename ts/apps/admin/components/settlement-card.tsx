"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Buffer } from "buffer";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SendTransactionError, Transaction, type TransactionInstruction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Wallet } from "lucide-react";
import { useAllOpenClaims, type OpenClaim } from "@/hooks/useAllOpenClaims";
import { usePayoutVault } from "@/hooks/usePayoutVault";
import { getProgram, getPoolPda, getPoolSignerPda, getReadonlyProgram, getSupportedUsdcConfigPda, PROGRAM_ID } from "@/lib/program";
import type { ProgramWallet } from "@/lib/program";
import { useSupportedUsdcMint } from "@/hooks/useSupportedUsdcMint";

const USDC_DECIMALS = 6;
const CLAIMS_PER_TX = 6;

interface AccountMetaLike {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
}

interface InstructionBuilder {
  accounts: (accounts: {
    pool: PublicKey;
    poolUsdc: PublicKey;
    supportedUsdcConfig: PublicKey;
    usdcMint: PublicKey;
    masterWallet: PublicKey;
    tokenProgram: PublicKey;
  }) => {
    remainingAccounts: (accounts: AccountMetaLike[]) => {
      instruction: () => Promise<TransactionInstruction>;
    };
  };
}

interface ProviderLike {
  sendAndConfirm: (tx: Transaction) => Promise<string>;
}

interface Stringable {
  toString(): string;
}

interface PoolAccountLike {
  totalPendingClaims: Stringable;
}

interface SettlementItem {
  claim: OpenClaim;
  requested: bigint;
  payout: bigint;
}

function formatUsdc(raw: bigint): string {
  if (raw === BigInt(0)) return "0.00";
  const normalized = raw.toString().padStart(USDC_DECIMALS + 1, "0");
  const head = normalized.slice(0, -USDC_DECIMALS);
  const tail = normalized.slice(-USDC_DECIMALS).slice(0, 2).padEnd(2, "0");
  return `${head}.${tail}`;
}

function parseUiUsdc(value: string | null): bigint {
  if (!value) return BigInt(0);
  const [whole, fraction = ""] = value.split(".");
  const normalizedWhole = whole.replace(/[^\d]/g, "") || "0";
  const normalizedFraction = fraction.replace(/[^\d]/g, "").slice(0, USDC_DECIMALS).padEnd(USDC_DECIMALS, "0");
  return BigInt(normalizedWhole) * BigInt(10 ** USDC_DECIMALS) + BigInt(normalizedFraction);
}

function chunkClaims<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function truncateWallet(wallet: string): string {
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

function formatTimestamp(raw: string): string {
  return new Date(Number(raw) * 1000).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}

function isBlockhashNotFoundError(error: unknown): boolean {
  return /blockhash not found/i.test(getErrorText(error));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function SettlementCard() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, signTransaction, signAllTransactions } = wallet;
  const {
    claims,
    closedClaims,
    totalRequested,
    loading: claimsLoading,
    error: claimsError,
    refresh: refreshClaims,
  } = useAllOpenClaims();
  const { balance: vaultBalance, loading: vaultLoading, error: vaultError, refresh: refreshVault } = usePayoutVault();

  const [settling, setSettling] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<{ settledClaims: number; failedClaims: number; signatures: string[] } | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [poolPendingClaims, setPoolPendingClaims] = useState<bigint | null>(null);
  const [poolStateError, setPoolStateError] = useState<string | null>(null);

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), []);
  const poolSignerPda = useMemo(() => getPoolSignerPda(poolPda, PROGRAM_ID), [poolPda]);
  const program = useMemo(
    () =>
      publicKey && signTransaction && signAllTransactions
        ? getProgram(connection, {
            publicKey,
            signTransaction,
            signAllTransactions,
          } satisfies ProgramWallet)
        : null,
    [connection, publicKey, signTransaction, signAllTransactions]
  );
  const readonlyProgram = useMemo(() => getReadonlyProgram(connection), [connection]);
  const { usdcMint } = useSupportedUsdcMint();
  const supportedUsdcConfigPda = useMemo(
    () => getSupportedUsdcConfigPda(PROGRAM_ID),
    []
  );
  const payoutVault = useMemo(() => {
    if (!usdcMint) return null;
    return getAssociatedTokenAddressSync(
      usdcMint,
      poolSignerPda,
      true,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
  }, [poolSignerPda, usdcMint]);

  const vaultRaw = useMemo(() => parseUiUsdc(vaultBalance), [vaultBalance]);
  const pendingClaimsMismatch = poolPendingClaims !== null && poolPendingClaims !== totalRequested;
  const pendingClaimsSyncRequired =
    poolPendingClaims !== null && totalRequested > poolPendingClaims;
  const underfundedPoolMismatch =
    poolPendingClaims !== null &&
    vaultRaw < poolPendingClaims &&
    totalRequested !== poolPendingClaims;
  const canBatchSafely =
    (poolPendingClaims !== null ? vaultRaw >= poolPendingClaims : vaultRaw >= totalRequested);

  const fetchPoolPendingClaims = useCallback(async () => {
    try {
      setPoolStateError(null);
      const accountApi = readonlyProgram.account as {
        pool: { fetch: (pubkey: typeof poolPda) => Promise<PoolAccountLike> };
      };
      const poolState = await accountApi.pool.fetch(poolPda);
      setPoolPendingClaims(BigInt(poolState.totalPendingClaims.toString()));
    } catch (e: unknown) {
      setPoolPendingClaims(null);
      setPoolStateError(e instanceof Error ? e.message : "Failed to fetch pool state");
    }
  }, [poolPda, readonlyProgram]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const accountApi = readonlyProgram.account as {
          pool: { fetch: (pubkey: typeof poolPda) => Promise<PoolAccountLike> };
        };
        setPoolStateError(null);
        const poolState = await accountApi.pool.fetch(poolPda);
        if (cancelled) return;
        setPoolPendingClaims(BigInt(poolState.totalPendingClaims.toString()));
      } catch (e: unknown) {
        if (cancelled) return;
        setPoolPendingClaims(null);
        setPoolStateError(e instanceof Error ? e.message : "Failed to fetch pool state");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchPoolPendingClaims, poolPda, readonlyProgram]);

  const settlementPlan = useMemo((): SettlementItem[] => {
    if (claims.length === 0 || totalRequested === BigInt(0) || vaultRaw === BigInt(0)) return [];

    const totalClaimable = vaultRaw < totalRequested ? vaultRaw : totalRequested;
    const items = claims.map((claim) => ({
      claim,
      requested: BigInt(claim.remainingUsdc),
      payout: BigInt(0),
    }));

    let distributed = BigInt(0);
    return items
      .map((item, index) => {
        const payout =
          index === items.length - 1
            ? totalClaimable - distributed
            : (item.requested * totalClaimable) / totalRequested;
        const capped = payout > item.requested ? item.requested : payout;
        distributed += capped;
        return { ...item, payout: capped };
      })
      .filter((item) => item.payout > BigInt(0));
  }, [claims, totalRequested, vaultRaw]);
  const requiresSingleTransaction = !canBatchSafely;
  const exceedsSingleTransactionLimit =
    requiresSingleTransaction && settlementPlan.length > CLAIMS_PER_TX;

  const totalPayout = useMemo(
    () => settlementPlan.reduce((sum, item) => sum + item.payout, BigInt(0)),
    [settlementPlan]
  );
  const payoutRatio = totalRequested > BigInt(0)
    ? Number((totalPayout * BigInt(10_000)) / totalRequested) / 100
    : 0;

  const handleSettleAll = useCallback(async () => {
    if (!program || !publicKey || !usdcMint || !payoutVault || settlementPlan.length === 0) return;
    if (exceedsSingleTransactionLimit) {
      setTxError(
        `This underfunded settlement run must include all open claims in one transaction, and ${settlementPlan.length} claims exceeds the current safe limit of ${CLAIMS_PER_TX}. Add more vault liquidity or settle after a program upgrade.`
      );
      return;
    }

    setSettling(true);
    setTxError(null);
    setResults(null);
    setProgress({ current: 0, total: settlementPlan.length });

    const succeeded: string[] = [];
    let settledClaims = 0;
    let failedClaims = 0;

    const batches = canBatchSafely
      ? chunkClaims(settlementPlan, CLAIMS_PER_TX)
      : [settlementPlan];

    const sendSettlementBatch = async (batch: SettlementItem[]): Promise<string> => {
      let lastError: unknown;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const tx = new Transaction();
          const remainingAccounts: AccountMetaLike[] = [];

          for (const item of batch) {
            const claimUser = new PublicKey(item.claim.user);
            const claimPubkey = new PublicKey(item.claim.pubkey);
            const userUsdcAta = getAssociatedTokenAddressSync(
              usdcMint,
              claimUser,
              false,
              TOKEN_2022_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID
            );

            tx.add(
              createAssociatedTokenAccountIdempotentInstruction(
                publicKey,
                userUsdcAta,
                claimUser,
                usdcMint,
                TOKEN_2022_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
              )
            );

            remainingAccounts.push(
              { pubkey: claimPubkey, isSigner: false, isWritable: true },
              { pubkey: userUsdcAta, isSigner: false, isWritable: true }
            );
          }

          const settleIx = await ((program.methods as unknown as { settleClaims: (claimIndices: Buffer) => InstructionBuilder })
            .settleClaims(Buffer.alloc(0))
            .accounts({
              pool: poolPda,
              poolUsdc: payoutVault,
              supportedUsdcConfig: supportedUsdcConfigPda,
              usdcMint,
              masterWallet: publicKey,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .remainingAccounts(remainingAccounts)
            .instruction());

          tx.add(settleIx);

          return await (program.provider as ProviderLike).sendAndConfirm(tx);
        } catch (e: unknown) {
          lastError = e;
          if (!isBlockhashNotFoundError(e) || attempt === 3) {
            throw e;
          }
          console.warn(`settle_claims: blockhash expired, retrying (${attempt}/3)`);
          await sleep(500 * attempt);
        }
      }

      throw lastError;
    };

    for (const batch of batches) {
      try {
        const sig = await sendSettlementBatch(batch);
        succeeded.push(sig);
        settledClaims += batch.length;
        setProgress((prev) => ({ current: prev.current + batch.length, total: prev.total }));
      } catch (e: unknown) {
        console.error("Failed to settle claim batch:", e);
        if (e instanceof SendTransactionError) {
          const logs = await e.getLogs(connection);
          if (logs?.length) {
            console.error("Settle claims transaction logs:", logs);
          }
        }
        failedClaims += batch.length;
        setTxError(
          getErrorMessage(
            e,
            canBatchSafely
              ? "Failed to settle one of the settlement batches."
              : "Failed to settle the underfunded claim set in a single transaction."
          )
        );
        if (!canBatchSafely) break;
      }
    }
    setResults({ settledClaims, failedClaims, signatures: succeeded });
    setSettling(false);
    await Promise.all([refreshClaims(), refreshVault(), fetchPoolPendingClaims()]);
  }, [canBatchSafely, connection, exceedsSingleTransactionLimit, fetchPoolPendingClaims, payoutVault, program, publicKey, refreshClaims, refreshVault, settlementPlan, usdcMint, poolPda, supportedUsdcConfigPda]);

  const loading = claimsLoading || vaultLoading;
  const canSettle =
    !!wallet.publicKey &&
    !!program &&
    !!usdcMint &&
    settlementPlan.length > 0 &&
    !settling &&
    !pendingClaimsSyncRequired &&
    !underfundedPoolMismatch &&
    !exceedsSingleTransactionLimit;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Distribution Plan</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Proportional distribution across current open claims using the live pool USDC vault.
          </p>
        </div>
        <button
          onClick={() => {
            refreshClaims();
            refreshVault();
            void fetchPoolPendingClaims();
          }}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-800/60 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-700 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-5">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500">Vault Balance</div>
          <p className="mt-2 font-mono text-lg font-semibold text-white">${vaultBalance ?? "0"}</p>
          <p className="mt-1 text-xs text-neutral-500">Token-2022 USDC in the pool vault</p>
        </div>
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-5">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500">Open Claims</div>
          <p className="mt-2 text-lg font-semibold text-white">{claims.length}</p>
          <p className="mt-1 text-xs text-neutral-500">eligible for settlement</p>
        </div>
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-5">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500">Total Owed</div>
          <p className="mt-2 font-mono text-lg font-semibold text-white">${formatUsdc(totalRequested)}</p>
          <p className="mt-1 text-xs text-neutral-500">sum of all open claim requests</p>
        </div>
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-5">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500">Payout Ratio</div>
          <p className={`mt-2 text-lg font-semibold ${payoutRatio >= 100 ? "text-[#00FFB2]" : "text-amber-400"}`}>
            {payoutRatio.toFixed(2)}%
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {payoutRatio >= 100 ? "full settlement available" : "proportional distribution"}
          </p>
        </div>
      </div>

      {!wallet.publicKey && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
          <Wallet className="mt-0.5 h-4 w-4 shrink-0" />
          Connect the admin wallet to settle claims.
        </div>
      )}

      {(claimsError || vaultError || txError || poolStateError) && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {txError ?? claimsError ?? vaultError ?? poolStateError}
        </div>
      )}

      {pendingClaimsMismatch && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          On-chain pending claims (${formatUsdc(poolPendingClaims ?? BigInt(0))}) do not match the decoded open-claim set (${formatUsdc(totalRequested)}).
          {pendingClaimsSyncRequired
            ? " Settlement is blocked because the on-chain tracker is stale low and must be synced before any settlement run."
            : underfundedPoolMismatch
              ? " Settlement is blocked because the program now requires the full underfunded claim set to prevent unfair payouts."
              : " Settlement can continue because the on-chain tracker is higher than the decoded open-claim set."}
        </div>
      )}


      {results && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Settled {results.settledClaims} claims across {results.signatures.length} transaction
            {results.signatures.length === 1 ? "" : "s"}.
          </div>
          {results.failedClaims > 0 && (
            <div className="mt-2 text-amber-300">
              {results.failedClaims} claims still need manual retry.
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/30 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Settlement Run</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Fully funded runs are split into small batches. Underfunded runs must still settle the full open-claim set in one transaction so the payout ratio matches on-chain math.
            </p>
          </div>
          <button
            onClick={() => void handleSettleAll()}
            disabled={!canSettle}
            className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-xl bg-[#00FFB2] px-4 py-2.5 text-sm font-medium text-black transition hover:bg-[#33FFC1] disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            {settling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Settling...
              </>
            ) : (
              "Settle Open Claims"
            )}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-neutral-800/60 bg-neutral-950/40 p-4">
            <div className="text-[11px] uppercase tracking-wider text-neutral-500">Claims in Run</div>
            <div className="mt-2 text-lg font-semibold text-white">{settlementPlan.length}</div>
          </div>
          <div className="rounded-lg border border-neutral-800/60 bg-neutral-950/40 p-4">
            <div className="text-[11px] uppercase tracking-wider text-neutral-500">Planned Payout</div>
            <div className="mt-2 font-mono text-lg font-semibold text-white">${formatUsdc(totalPayout)}</div>
          </div>
          <div className="rounded-lg border border-neutral-800/60 bg-neutral-950/40 p-4">
            <div className="text-[11px] uppercase tracking-wider text-neutral-500">Admin Wallet</div>
            <div className="mt-2 font-mono text-sm text-white">
              {wallet.publicKey ? truncateWallet(wallet.publicKey.toBase58()) : "Not connected"}
            </div>
          </div>
        </div>

        {settling && (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs text-neutral-400">
              <span>Processing claims</span>
              <span>
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-800/60">
              <div
                className="h-full rounded-full bg-[#00FFB2] transition-all"
                style={{
                  width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : "0%",
                }}
              />
            </div>
          </div>
        )}
      </div>

      <section className="overflow-hidden rounded-xl border border-neutral-800/60">
        <div className="border-b border-neutral-800/60 bg-neutral-900/30 px-5 py-3">
          <h3 className="text-sm font-medium text-white">Open Claims in Current Run</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-neutral-800/60 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-5 py-3">Claim</th>
                <th className="px-5 py-3">Wallet</th>
                <th className="px-5 py-3 text-right">Outstanding</th>
                <th className="px-5 py-3 text-right">Paid</th>
                <th className="px-5 py-3 text-right">Planned Payout</th>
                <th className="px-5 py-3 text-right">Created</th>
                <th className="px-5 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-neutral-500">
                    Loading open claims...
                  </td>
                </tr>
              ) : claims.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-neutral-500">
                    No open claims.
                  </td>
                </tr>
              ) : (
                claims.map((claim) => {
                  const plannedItem = settlementPlan.find((item) => item.claim.pubkey === claim.pubkey);
                  const plannedPayout = plannedItem?.payout ?? BigInt(0);

                  return (
                    <tr key={claim.pubkey} className="border-b border-neutral-800/40 last:border-b-0">
                      <td className="px-5 py-4 font-mono text-sm text-white">{claim.id}</td>
                      <td className="px-5 py-4 font-mono text-sm text-neutral-300">
                        {truncateWallet(claim.user)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-sm text-white">
                        ${formatUsdc(BigInt(claim.remainingUsdc))}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-sm text-neutral-300">
                        ${formatUsdc(BigInt(claim.paidUsdc))}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-sm text-[#00FFB2]">
                        ${formatUsdc(plannedPayout)}
                      </td>
                      <td className="px-5 py-4 text-right text-sm text-neutral-300">
                        {formatTimestamp(claim.createdAt)}
                      </td>
                      <td className="px-5 py-4 text-right text-sm">
                        {plannedPayout > BigInt(0) ? (
                          <span className="text-amber-400">Included</span>
                        ) : BigInt(claim.paidUsdc) > BigInt(0) ? (
                          <span className="text-sky-400">Partially Paid</span>
                        ) : (
                          <span className="text-neutral-500">No payout</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-neutral-800/60">
        <div className="border-b border-neutral-800/60 bg-neutral-900/30 px-5 py-3">
          <h3 className="text-sm font-medium text-white">Settled Claims</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-neutral-800/60 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-5 py-3">Claim</th>
                <th className="px-5 py-3">Wallet</th>
                <th className="px-5 py-3 text-right">Requested</th>
                <th className="px-5 py-3 text-right">Paid</th>
                <th className="px-5 py-3 text-right">Settled</th>
                <th className="px-5 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-neutral-500">
                    Loading settled claims...
                  </td>
                </tr>
              ) : closedClaims.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-neutral-500">
                    No settled claims yet.
                  </td>
                </tr>
              ) : (
                closedClaims.map((claim) => (
                  <tr key={claim.pubkey} className="border-b border-neutral-800/40 last:border-b-0">
                    <td className="px-5 py-4 font-mono text-sm text-white">{claim.id}</td>
                    <td className="px-5 py-4 font-mono text-sm text-neutral-300">
                      {truncateWallet(claim.user)}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm text-neutral-300">
                      ${formatUsdc(BigInt(claim.requestedUsdc))}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm text-white">
                      ${formatUsdc(BigInt(claim.paidUsdc))}
                    </td>
                    <td className="px-5 py-4 text-right text-sm text-neutral-300">
                      {formatTimestamp(claim.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-right text-sm text-[#00FFB2]">Settled</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
