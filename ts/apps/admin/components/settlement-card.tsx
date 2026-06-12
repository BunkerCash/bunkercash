"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Buffer } from "buffer";
import BN from "bn.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SendTransactionError, SystemProgram, Transaction, type TransactionInstruction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Wallet } from "lucide-react";
import { useAllOpenClaims, type OpenClaim } from "@/hooks/useAllOpenClaims";
import { usePayoutVault } from "@/hooks/usePayoutVault";
import { getBunkercashMintPda, getMinSettlementConfigPda, getProgram, getPoolPda, getPoolSignerPda, getReadonlyProgram, getSettlementStatePda, getSupportedUsdcConfigPda, PROGRAM_ID } from "@/lib/program";
import type { ProgramWallet } from "@/lib/program";
import { useSupportedUsdcMint } from "@/hooks/useSupportedUsdcMint";

const USDC_DECIMALS = 6;
const CLAIMS_PER_TX = 6;
const MIGRATIONS_PER_TX = 8;

interface AccountMetaLike {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
}

interface InstructionBuilder {
  accounts: (accounts: {
    pool: PublicKey;
    poolUsdc: PublicKey;
    bunkercashMint: PublicKey;
    poolBunkercashEscrow: PublicKey;
    supportedUsdcConfig: PublicKey;
    usdcMint: PublicKey;
    settlementState: PublicKey;
    masterWallet: PublicKey;
    usdcTokenProgram: PublicKey;
    tokenProgram: PublicKey;
  }) => {
    remainingAccounts: (accounts: AccountMetaLike[]) => {
      instruction: () => Promise<TransactionInstruction>;
    };
  };
}

interface MigrateClaimMethods {
  migrateClaim: () => {
    accounts: (accounts: {
      pool: PublicKey;
      claim: PublicKey;
      settlementCheck: PublicKey;
      payer: PublicKey;
      systemProgram: PublicKey;
    }) => {
      instruction: () => Promise<TransactionInstruction>;
    };
  };
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

function isAlreadyProcessedError(error: unknown): boolean {
  return /already been processed/i.test(getErrorText(error));
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
  const [minSettlementUsdc, setMinSettlementUsdc] = useState<bigint | null>(null);
  const [minSettlementInput, setMinSettlementInput] = useState("");
  const [savingMinSettlement, setSavingMinSettlement] = useState(false);
  const [epochOpen, setEpochOpen] = useState(false);
  const [epochLoading, setEpochLoading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState({ current: 0, total: 0 });
  const [epochError, setEpochError] = useState<string | null>(null);
  const [epochPayoutRatio, setEpochPayoutRatio] = useState<number | null>(null);
  const [epochPayoutRatioPpm, setEpochPayoutRatioPpm] = useState<bigint | null>(null);
  const [epochVaultSnapshot, setEpochVaultSnapshot] = useState<bigint | null>(null);
  const [epochPendingSnapshot, setEpochPendingSnapshot] = useState<bigint | null>(null);
  // total_processed_usdc + total_cancelled_usdc from the settlement state:
  // how much of pending_snapshot has been covered so far this epoch.
  // close_settlement succeeds only once this reaches the pending snapshot.
  const [epochCoveredUsdc, setEpochCoveredUsdc] = useState<bigint | null>(null);

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), []);
  const poolSignerPda = useMemo(() => getPoolSignerPda(poolPda, PROGRAM_ID), [poolPda]);
  const settlementStatePda = useMemo(() => getSettlementStatePda(poolPda, PROGRAM_ID), [poolPda]);
  const bunkercashMintPda = useMemo(() => getBunkercashMintPda(PROGRAM_ID), []);
  const poolBunkercashEscrow = useMemo(
    () =>
      getAssociatedTokenAddressSync(
        bunkercashMintPda,
        poolPda,
        true,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    [bunkercashMintPda, poolPda],
  );
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
  const { usdcMint, usdcTokenProgram } = useSupportedUsdcMint();
  const supportedUsdcConfigPda = useMemo(
    () => getSupportedUsdcConfigPda(PROGRAM_ID),
    []
  );
  const payoutVault = useMemo(() => {
    if (!usdcMint || !usdcTokenProgram) return null;
    return getAssociatedTokenAddressSync(
      usdcMint,
      poolSignerPda,
      true,
      usdcTokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
  }, [poolSignerPda, usdcMint, usdcTokenProgram]);

  const vaultRaw = useMemo(() => parseUiUsdc(vaultBalance), [vaultBalance]);
  // Hard precondition for opening an epoch: legacy-layout claims cannot be
  // settled (deserialization fails), cannot be migrated while an epoch is
  // open, and are still counted in the epoch's pending snapshot — opening an
  // epoch with any of them outstanding deadlocks settlement, migration and
  // master withdrawals until the epoch is force-resolved.
  const needsMigrationCount = useMemo(
    () => claims.filter((claim) => claim.needsMigration).length,
    [claims]
  );
  const pendingClaimsMismatch = poolPendingClaims !== null && poolPendingClaims !== totalRequested;
  const pendingClaimsSyncRequired =
    poolPendingClaims !== null && totalRequested > poolPendingClaims;
  const underfundedPoolMismatch =
    poolPendingClaims !== null &&
    vaultRaw < poolPendingClaims &&
    totalRequested !== poolPendingClaims;

  const fetchPoolPendingClaims = useCallback(async (signal?: AbortSignal) => {
    try {
      setPoolStateError(null);
      const accountApi = readonlyProgram.account as {
        pool: { fetch: (pubkey: typeof poolPda) => Promise<PoolAccountLike> };
      };
      const poolState = await accountApi.pool.fetch(poolPda);
      if (signal?.aborted) return;
      setPoolPendingClaims(BigInt(poolState.totalPendingClaims.toString()));
    } catch (e: unknown) {
      if (signal?.aborted) return;
      setPoolPendingClaims(null);
      setPoolStateError(e instanceof Error ? e.message : "Failed to fetch pool state");
    }
  }, [poolPda, readonlyProgram]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchPoolPendingClaims(controller.signal);
    return () => controller.abort();
  }, [fetchPoolPendingClaims]);

  interface SettlementStateAccount {
    pool: PublicKey;
    vaultSnapshot: { toString(): string };
    pendingSnapshot: { toString(): string };
    payoutRatioPpm: { toString(): string };
    totalSettledUsdc: { toString(): string };
    totalCancelledUsdc: { toString(): string };
    totalProcessedUsdc: { toString(): string };
    epochSeq: { toString(): string };
    timestamp: { toString(): string };
    bump: number;
  }

  const fetchSettlementEpoch = useCallback(async (signal?: AbortSignal) => {
    try {
      const accountApi = readonlyProgram.account as {
        settlementState?: {
          fetch: (pubkey: PublicKey) => Promise<SettlementStateAccount>;
        };
      };
      if (!accountApi.settlementState) return;
      const state = await accountApi.settlementState.fetch(settlementStatePda);
      if (signal?.aborted) return;
      setEpochOpen(true);
      setEpochError(null);
      setEpochVaultSnapshot(BigInt(state.vaultSnapshot.toString()));
      setEpochPendingSnapshot(BigInt(state.pendingSnapshot.toString()));
      setEpochCoveredUsdc(
        BigInt(state.totalProcessedUsdc.toString()) +
          BigInt(state.totalCancelledUsdc.toString())
      );
      const ppm = BigInt(state.payoutRatioPpm.toString());
      setEpochPayoutRatioPpm(ppm);
      setEpochPayoutRatio(Number(ppm) / 10_000);
    } catch (e: unknown) {
      if (signal?.aborted) return;
      setEpochOpen(false);
      setEpochPayoutRatio(null);
      setEpochPayoutRatioPpm(null);
      setEpochVaultSnapshot(null);
      setEpochPendingSnapshot(null);
      setEpochCoveredUsdc(null);
      const isAccountNotFound =
        e instanceof Error && e.message.includes("could not find account");
      if (!isAccountNotFound) {
        setEpochError(getErrorMessage(e, "Failed to fetch settlement epoch"));
      }
    }
  }, [readonlyProgram, settlementStatePda]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchSettlementEpoch(controller.signal);
    return () => controller.abort();
  }, [fetchSettlementEpoch]);

  const minSettlementConfigPda = useMemo(() => getMinSettlementConfigPda(PROGRAM_ID), []);

  const fetchMinSettlementConfig = useCallback(async () => {
    try {
      const accountApi = readonlyProgram.account as {
        minSettlementConfig?: {
          fetch: (pubkey: PublicKey) => Promise<{ minSettlementUsdc: { toString(): string } }>;
        };
      };
      if (!accountApi.minSettlementConfig) return;
      const config = await accountApi.minSettlementConfig.fetch(minSettlementConfigPda);
      const raw = BigInt(config.minSettlementUsdc.toString());
      setMinSettlementUsdc(raw);
      setMinSettlementInput(formatUsdc(raw));
    } catch {
      setMinSettlementUsdc(null);
    }
  }, [minSettlementConfigPda, readonlyProgram]);

  useEffect(() => {
    void fetchMinSettlementConfig();
  }, [fetchMinSettlementConfig]);

  const vaultBelowMinSettlement =
    minSettlementUsdc !== null && minSettlementUsdc > BigInt(0) && vaultRaw < minSettlementUsdc;

  const handleSaveMinSettlement = useCallback(async () => {
    if (!program || !publicKey) return;
    setSavingMinSettlement(true);
    setTxError(null);
    try {
      const rawValue = parseUiUsdc(minSettlementInput);
      const methods = program.methods as unknown as {
        setMinSettlementUsdc: (amount: BN) => {
          accounts: (accounts: Record<string, PublicKey>) => {
            rpc: () => Promise<string>;
          };
        };
      };
      await methods
        .setMinSettlementUsdc(new BN(rawValue.toString()))
        .accounts({
          pool: poolPda,
          minSettlementConfig: minSettlementConfigPda,
          admin: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setMinSettlementUsdc(rawValue);
    } catch (e: unknown) {
      setTxError(e instanceof Error ? e.message : "Failed to save minimum settlement threshold");
    } finally {
      setSavingMinSettlement(false);
    }
  }, [minSettlementConfigPda, minSettlementInput, poolPda, program, publicKey]);

  const handleOpenSettlement = useCallback(async () => {
    if (!program || !publicKey || !usdcMint || !usdcTokenProgram || !payoutVault) return;
    if (needsMigrationCount > 0) {
      setEpochError(
        `${needsMigrationCount} legacy claim${needsMigrationCount === 1 ? "" : "s"} must be migrated before a settlement epoch can open.`
      );
      return;
    }
    setEpochLoading(true);
    setEpochError(null);
    setTxError(null);
    try {
      const methods = program.methods as unknown as {
        openSettlement: () => {
          accounts: (accounts: Record<string, PublicKey>) => {
            rpc: () => Promise<string>;
          };
        };
      };
      await methods
        .openSettlement()
        .accounts({
          pool: poolPda,
          poolUsdc: payoutVault,
          supportedUsdcConfig: supportedUsdcConfigPda,
          usdcMint,
          settlementState: settlementStatePda,
          minSettlementConfig: minSettlementConfigPda,
          masterWallet: publicKey,
          usdcTokenProgram,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await fetchSettlementEpoch();
      await Promise.all([refreshVault(), fetchPoolPendingClaims()]);
    } catch (e: unknown) {
      setEpochError(getErrorMessage(e, "Failed to open settlement epoch"));
    } finally {
      setEpochLoading(false);
    }
  }, [fetchPoolPendingClaims, fetchSettlementEpoch, minSettlementConfigPda, needsMigrationCount, payoutVault, poolPda, program, publicKey, refreshVault, settlementStatePda, supportedUsdcConfigPda, usdcMint, usdcTokenProgram]);

  const handleCloseSettlement = useCallback(async () => {
    if (!program || !publicKey) return;
    setEpochLoading(true);
    setEpochError(null);
    setTxError(null);
    try {
      const methods = program.methods as unknown as {
        closeSettlement: () => {
          accounts: (accounts: Record<string, PublicKey>) => {
            rpc: () => Promise<string>;
          };
        };
      };
      await methods
        .closeSettlement()
        .accounts({
          pool: poolPda,
          settlementState: settlementStatePda,
          masterWallet: publicKey,
        })
        .rpc();
      setEpochOpen(false);
      setEpochPayoutRatio(null);
      setEpochPayoutRatioPpm(null);
      setEpochVaultSnapshot(null);
      setEpochPendingSnapshot(null);
      setEpochCoveredUsdc(null);
      await Promise.all([refreshClaims(), refreshVault(), fetchPoolPendingClaims()]);
    } catch (e: unknown) {
      setEpochError(getErrorMessage(e, "Failed to close settlement epoch"));
    } finally {
      setEpochLoading(false);
    }
  }, [fetchPoolPendingClaims, poolPda, program, publicKey, refreshClaims, refreshVault, settlementStatePda]);

  // migrate_claim is permissionless on-chain (the connected wallet only pays
  // the realloc rent), so this works for any operator wallet. It reverts if a
  // settlement epoch is open, which cannot happen from this card because
  // epoch-open is blocked while legacy claims exist.
  const handleMigrateClaims = useCallback(async () => {
    if (!program || !publicKey || !signTransaction) return;
    const legacyClaims = claims.filter((claim) => claim.needsMigration);
    if (legacyClaims.length === 0) return;

    setMigrating(true);
    setTxError(null);
    setMigrationProgress({ current: 0, total: legacyClaims.length });
    try {
      const methods = program.methods as unknown as MigrateClaimMethods;
      for (const batch of chunkClaims(legacyClaims, MIGRATIONS_PER_TX)) {
        const tx = new Transaction();
        for (const claim of batch) {
          tx.add(
            await methods
              .migrateClaim()
              .accounts({
                pool: poolPda,
                claim: new PublicKey(claim.pubkey),
                settlementCheck: settlementStatePda,
                payer: publicKey,
                systemProgram: SystemProgram.programId,
              })
              .instruction()
          );
        }
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;
        const signed = await signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });
        await connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "confirmed",
        );
        setMigrationProgress((prev) => ({ current: prev.current + batch.length, total: prev.total }));
      }
    } catch (e: unknown) {
      setTxError(getErrorMessage(e, "Failed to migrate legacy claims"));
    } finally {
      setMigrating(false);
      // Re-fetch so needsMigrationCount reflects on-chain state before the
      // operator can attempt to open an epoch.
      await refreshClaims();
    }
  }, [claims, connection, poolPda, program, publicKey, refreshClaims, settlementStatePda, signTransaction]);

  const settlementPlan = useMemo((): SettlementItem[] => {
    // Legacy claims (pre-epoch-fields layout) cannot be passed to
    // settle_claims: the program deserializes the current Claim struct and a
    // smaller account reverts the whole batch. Exclude them from the plan and
    // compute the proportional split against the settleable subset only, so
    // the denominator matches the items being distributed.
    const settleableClaims = claims.filter((claim) => !claim.needsMigration);
    const settleableTotalRequested = settleableClaims.reduce(
      (sum, claim) => sum + BigInt(claim.remainingUsdc),
      BigInt(0)
    );
    if (settleableClaims.length === 0 || settleableTotalRequested === BigInt(0)) return [];

    if (epochOpen && epochPayoutRatioPpm !== null) {
      const fullyFunded = epochPayoutRatioPpm >= BigInt(1_000_000);
      return settleableClaims
        .map((claim) => {
          const remaining = BigInt(claim.remainingUsdc);
          const payout = (remaining * epochPayoutRatioPpm) / BigInt(1_000_000);
          const capped = payout > remaining ? remaining : payout;
          return { claim, requested: remaining, payout: capped };
        })
        // In an underfunded epoch the program rejects any batch that omits an
        // eligible claim (IncompleteSettlementSet), including dust whose
        // payout truncates to 0 — those must be submitted so the chain can
        // stamp them into the epoch's completeness accounting. Batch
        // inclusion is therefore decided by remaining amount, not payout
        // positivity. Fully funded epochs can keep the payout filter since
        // every remaining claim pays out in full anyway.
        .filter((item) => (fullyFunded ? item.payout > BigInt(0) : item.requested > BigInt(0)));
    }

    if (vaultRaw === BigInt(0)) return [];
    const totalClaimable =
      vaultRaw < settleableTotalRequested ? vaultRaw : settleableTotalRequested;
    const items = settleableClaims.map((claim) => ({
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
            : (item.requested * totalClaimable) / settleableTotalRequested;
        const capped = payout > item.requested ? item.requested : payout;
        distributed += capped;
        return { ...item, payout: capped };
      })
      .filter((item) => item.payout > BigInt(0));
  }, [claims, vaultRaw, epochOpen, epochPayoutRatioPpm]);
  // Underfunded epochs no longer need a single transaction: the program
  // accepts partial batches against the locked payout ratio, and
  // close_settlement enforces that cumulative coverage reaches the pending
  // snapshot. Every run, funded or not, is chunked by CLAIMS_PER_TX.
  const epochCoverageComplete =
    epochPendingSnapshot !== null && epochCoveredUsdc !== null
      ? epochCoveredUsdc >= epochPendingSnapshot
      : null;

  const totalPayout = useMemo(
    () => settlementPlan.reduce((sum, item) => sum + item.payout, BigInt(0)),
    [settlementPlan]
  );
  // Preview ratio (no epoch open yet) mirrors the on-chain
  // compute_settlement_payout_ratio: vault over ALL pending claims, since
  // opening an epoch snapshots pool.total_pending_claims (which still
  // includes unmigrated legacy claims). Do NOT derive this from totalPayout,
  // which is restricted to the settleable subset — that would understate the
  // ratio whenever legacy claims are present. The on-chain epoch branch above
  // uses the authoritative ratio once an epoch is open.
  const payoutRatio = epochOpen && epochPayoutRatio !== null
    ? epochPayoutRatio
    : totalRequested > BigInt(0)
      ? Number(((vaultRaw < totalRequested ? vaultRaw : totalRequested) * BigInt(10_000)) / totalRequested) / 100
      : 0;

  const handleSettleAll = useCallback(async () => {
    if (!program || !publicKey || !usdcMint || !usdcTokenProgram || !payoutVault || settlementPlan.length === 0) return;

    setSettling(true);
    setTxError(null);
    setResults(null);
    setProgress({ current: 0, total: settlementPlan.length });

    const succeeded: string[] = [];
    let settledClaims = 0;
    let failedClaims = 0;

    const batches = chunkClaims(settlementPlan, CLAIMS_PER_TX);

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
              usdcTokenProgram,
              ASSOCIATED_TOKEN_PROGRAM_ID
            );

            tx.add(
              createAssociatedTokenAccountIdempotentInstruction(
                publicKey,
                userUsdcAta,
                claimUser,
                usdcMint,
                usdcTokenProgram,
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
              bunkercashMint: bunkercashMintPda,
              poolBunkercashEscrow,
              supportedUsdcConfig: supportedUsdcConfigPda,
              usdcMint,
              settlementState: settlementStatePda,
              masterWallet: publicKey,
              usdcTokenProgram,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .remainingAccounts(remainingAccounts)
            .instruction());

          tx.add(settleIx);

          // Fetch a fresh blockhash for each attempt to avoid stale blockhash reuse
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
          tx.recentBlockhash = blockhash;
          tx.feePayer = publicKey;

          if (!signTransaction) throw new Error("Wallet does not support signTransaction");
          const signed = await signTransaction(tx);
          const rawTx = signed.serialize();

          const sig = await connection.sendRawTransaction(rawTx, {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          });

          await connection.confirmTransaction(
            { signature: sig, blockhash, lastValidBlockHeight },
            "confirmed",
          );

          return sig;
        } catch (e: unknown) {
          if (isAlreadyProcessedError(e)) {
            console.info("settle_claims: transaction already processed (likely succeeded on a prior attempt)");
            return "already-processed";
          }
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
        if (sig !== "already-processed") {
          succeeded.push(sig);
        }
        settledClaims += batch.length;
        setProgress((prev) => ({ current: prev.current + batch.length, total: prev.total }));
      } catch (e: unknown) {
        if (isAlreadyProcessedError(e)) {
          console.info("settle_claims: batch already processed on-chain, treating as success");
          settledClaims += batch.length;
          setProgress((prev) => ({ current: prev.current + batch.length, total: prev.total }));
          continue;
        }
        console.error("Failed to settle claim batch:", e);
        if (e instanceof SendTransactionError) {
          const logs = await e.getLogs(connection);
          if (logs?.length) {
            console.error("Settle claims transaction logs:", logs);
          }
        }
        failedClaims += batch.length;
        setTxError(getErrorMessage(e, "Failed to settle one of the settlement batches."));
      }
    }
    setResults({ settledClaims, failedClaims, signatures: succeeded });
    setSettling(false);
    await Promise.all([refreshClaims(), refreshVault(), fetchPoolPendingClaims(), fetchSettlementEpoch()]);
  }, [bunkercashMintPda, connection, fetchPoolPendingClaims, fetchSettlementEpoch, payoutVault, poolBunkercashEscrow, program, publicKey, signTransaction, refreshClaims, refreshVault, settlementPlan, settlementStatePda, usdcMint, usdcTokenProgram, poolPda, supportedUsdcConfigPda]);

  const loading = claimsLoading || vaultLoading;
  const canSettle =
    !!wallet.publicKey &&
    !!program &&
    !!usdcMint &&
    epochOpen &&
    settlementPlan.length > 0 &&
    !settling &&
    !pendingClaimsSyncRequired &&
    !vaultBelowMinSettlement;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Distribution Plan</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Proportional distribution across current open requests using the live pool USDC vault.
          </p>
        </div>
        <button
          onClick={() => {
            refreshClaims();
            refreshVault();
            void fetchPoolPendingClaims();
            void fetchSettlementEpoch();
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
          <p className="mt-1 text-xs text-neutral-500">USDC in the pool vault</p>
        </div>
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-5">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500">Open Requests</div>
          <p className="mt-2 text-lg font-semibold text-white">{claims.length}</p>
          <p className="mt-1 text-xs text-neutral-500">eligible for settlement</p>
        </div>
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-5">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500">Total Owed</div>
          <p className="mt-2 font-mono text-lg font-semibold text-white">${formatUsdc(totalRequested)}</p>
          <p className="mt-1 text-xs text-neutral-500">sum of all open request amounts</p>
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

      {needsMigrationCount > 0 && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-rose-300">
                {needsMigrationCount} claim{needsMigrationCount === 1 ? "" : "s"} must be migrated before settlement
              </h2>
              <p className="mt-1 text-sm text-rose-200/80">
                {needsMigrationCount === 1 ? "This claim uses" : "These claims use"} a legacy account
                layout from before the settlement-epoch upgrade. Opening a settlement epoch is
                blocked: legacy claims cannot be settled or migrated while an epoch is open, yet
                they still count toward the epoch snapshot, so an epoch opened now could never
                close. Migrate them here (or via the
                {" "}<span className="font-mono">migrate-accounts.ts</span> script), then re-check.
              </p>
            </div>
            <button
              onClick={() => void handleMigrateClaims()}
              disabled={!wallet.publicKey || !program || migrating || epochOpen}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-rose-500/20 px-4 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {migrating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {migrating
                ? `Migrating ${migrationProgress.current}/${migrationProgress.total}...`
                : "Migrate Claims"}
            </button>
          </div>
          {epochOpen && (
            <p className="mt-3 text-sm text-rose-200/80">
              A settlement epoch is currently open, so migration is blocked on-chain. Close the
              epoch first, then migrate.
            </p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/30 p-5">
        <h2 className="text-base font-semibold text-white">Minimum Settlement Threshold</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Vault must hold at least this much USDC before a settlement epoch can open. Set to 0 to disable.
        </p>
        <div className="mt-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-neutral-400">Min USDC</label>
            <input
              type="text"
              value={minSettlementInput}
              onChange={(e) => setMinSettlementInput(e.target.value)}
              placeholder="e.g. 100.00"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950/60 px-3 py-2 font-mono text-sm text-white placeholder:text-neutral-600 focus:border-[#00FFB2]/50 focus:outline-none"
            />
          </div>
          <button
            onClick={() => void handleSaveMinSettlement()}
            disabled={!wallet.publicKey || !program || savingMinSettlement}
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingMinSettlement ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </button>
        </div>
        {minSettlementUsdc !== null && minSettlementUsdc > BigInt(0) && (
          <p className="mt-2 text-xs text-neutral-400">
            Current on-chain minimum: <span className="font-mono text-white">${formatUsdc(minSettlementUsdc)}</span> USDC
          </p>
        )}
      </div>

      <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/30 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Settlement Epoch</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {epochOpen
                ? "A settlement epoch is active. Settle all eligible claims in batches, then close the epoch once coverage is complete."
                : "Open an epoch to snapshot the vault balance and lock the payout ratio before settling."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!epochOpen ? (
              <button
                onClick={() => void handleOpenSettlement()}
                disabled={!wallet.publicKey || !program || epochLoading || migrating || claims.length === 0 || needsMigrationCount > 0 || vaultBelowMinSettlement}
                className="inline-flex items-center gap-2 rounded-lg bg-[#00FFB2] px-4 py-2 text-sm font-medium text-black transition hover:bg-[#33FFC1] disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
              >
                {epochLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Open Epoch
              </button>
            ) : (
              <button
                onClick={() => void handleCloseSettlement()}
                disabled={!wallet.publicKey || !program || epochLoading || settling || epochCoverageComplete === false}
                title={epochCoverageComplete === false ? "Every claim in the epoch snapshot must be settled or cancelled before the epoch can close." : undefined}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {epochLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Close Epoch
              </button>
            )}
          </div>
        </div>

        {epochOpen && (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-neutral-800/60 bg-neutral-950/40 p-4">
              <div className="text-[11px] uppercase tracking-wider text-neutral-500">Vault Snapshot</div>
              <div className="mt-2 font-mono text-lg font-semibold text-white">
                ${epochVaultSnapshot !== null ? formatUsdc(epochVaultSnapshot) : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-neutral-800/60 bg-neutral-950/40 p-4">
              <div className="text-[11px] uppercase tracking-wider text-neutral-500">Pending Snapshot</div>
              <div className="mt-2 font-mono text-lg font-semibold text-white">
                ${epochPendingSnapshot !== null ? formatUsdc(epochPendingSnapshot) : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-neutral-800/60 bg-neutral-950/40 p-4">
              <div className="text-[11px] uppercase tracking-wider text-neutral-500">Locked Payout Ratio</div>
              <div className={`mt-2 text-lg font-semibold ${epochPayoutRatio !== null && epochPayoutRatio >= 100 ? "text-[#00FFB2]" : "text-amber-400"}`}>
                {epochPayoutRatio !== null ? `${epochPayoutRatio.toFixed(2)}%` : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-neutral-800/60 bg-neutral-950/40 p-4">
              <div className="text-[11px] uppercase tracking-wider text-neutral-500">Epoch Coverage</div>
              <div className={`mt-2 font-mono text-lg font-semibold ${epochCoverageComplete ? "text-[#00FFB2]" : "text-amber-400"}`}>
                {epochCoveredUsdc !== null && epochPendingSnapshot !== null
                  ? `$${formatUsdc(epochCoveredUsdc)} / $${formatUsdc(epochPendingSnapshot)}`
                  : "—"}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {epochCoverageComplete
                  ? "complete — epoch can close"
                  : "settled + cancelled vs snapshot"}
              </div>
            </div>
          </div>
        )}

        {epochError && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {epochError}
          </div>
        )}

        {!epochOpen && wallet.publicKey && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            No active settlement epoch. Open an epoch before settling claims.
          </div>
        )}
      </div>

      {vaultBelowMinSettlement && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Vault balance (${vaultBalance ?? "0"}) is below the configured minimum settlement threshold (${formatUsdc(minSettlementUsdc ?? BigInt(0))}). Settlement is blocked until the vault is funded.
        </div>
      )}

      {!wallet.publicKey && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
          <Wallet className="mt-0.5 h-4 w-4 shrink-0" />
          Connect the admin wallet to settle requests.
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
          On-chain pending requests (${formatUsdc(poolPendingClaims ?? BigInt(0))}) do not match the decoded open-request set (${formatUsdc(totalRequested)}).
          {pendingClaimsSyncRequired
            ? " Settlement is blocked because the on-chain tracker is stale low and must be synced before any settlement run."
            : underfundedPoolMismatch
              ? " Settlement can proceed in batches at the epoch's locked payout ratio, but the epoch cannot close until every request in the snapshot has been processed — investigate the mismatch if coverage stalls."
              : " Settlement can continue because the on-chain tracker is higher than the decoded open-request set."}
        </div>
      )}


      {results && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Settled {results.settledClaims} requests across {results.signatures.length} transaction
            {results.signatures.length === 1 ? "" : "s"}.
          </div>
          {results.failedClaims > 0 && (
            <div className="mt-2 text-amber-300">
              {results.failedClaims} requests still need manual retry.
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/30 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Settlement Run</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Runs are split into batches of {CLAIMS_PER_TX} requests per transaction. Underfunded
              epochs pay every request at the payout ratio locked when the epoch opened, across as
              many batches as needed; the epoch can close once every request in the snapshot is
              processed.
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
              "Settle Open Requests"
            )}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-neutral-800/60 bg-neutral-950/40 p-4">
            <div className="text-[11px] uppercase tracking-wider text-neutral-500">Requests in Run</div>
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
              <span>Processing requests</span>
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
          <h3 className="text-sm font-medium text-white">Open Requests in Current Run</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-neutral-800/60 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-5 py-3">Request</th>
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
                    Loading open requests...
                  </td>
                </tr>
              ) : claims.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-neutral-500">
                    No open requests.
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
                        {plannedItem ? (
                          plannedPayout > BigInt(0) ? (
                            <span className="text-amber-400">Included</span>
                          ) : (
                            <span className="text-amber-400">Included (no payout)</span>
                          )
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
          <h3 className="text-sm font-medium text-white">Settled Requests</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-neutral-800/60 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-5 py-3">Request</th>
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
                    Loading settled requests...
                  </td>
                </tr>
              ) : closedClaims.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-neutral-500">
                    No settled requests yet.
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
                    <td className={`px-5 py-4 text-right text-sm ${claim.cancelled ? "text-red-300" : "text-[#00FFB2]"}`}>
                      {claim.cancelled ? "Cancelled" : "Settled"}
                    </td>
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
