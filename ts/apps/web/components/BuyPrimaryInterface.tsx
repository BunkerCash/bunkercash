'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { Idl, Program } from '@coral-xyz/anchor'
import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, SendTransactionError, SystemProgram, Transaction, type TransactionInstruction } from '@solana/web3.js'
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
  getBunkercashMintPda,
  getFeeConfigPda,
  getPoolPda,
  getPurchaseLimitConfigPda,
  getSupportedUsdcConfigPda,
  fetchConfiguredUsdcMint,
  fetchMintTokenProgram,
  getProgram,
  type ProgramWallet,
  PROGRAM_ID,
} from "@/lib/program";
import { countFractionalDigits, parseUiAmountToBaseUnits } from "@/lib/amounts";
import { getClusterFromEndpoint } from "@/lib/constants";
import { ArrowDown, AlertCircle } from "lucide-react";
import { BN } from '@coral-xyz/anchor'
import { useToast } from "@/components/ui/ToastContext";
import { useSupportedUsdcMint } from "@/hooks/useSupportedUsdcMint";
import { invalidateTransactionCache } from "@/hooks/useMyTransactions";
import { sendAndConfirmWalletTransaction } from "@/lib/sendAndConfirmWalletTransaction";
import { useOptionalWallet } from "@/hooks/useOptionalWallet";

const USDC_DECIMALS = 6
const USDC_SCALE = 10n ** BigInt(USDC_DECIMALS)
const MIN_USDC_AMOUNT_RAW = USDC_SCALE / 100n
const MAX_USDC_AMOUNT_RAW = 1_000_000n * USDC_SCALE

function toUi(amount: bigint, decimals: number): string {
  const s = amount.toString().padStart(decimals + 1, '0')
  const head = s.slice(0, -decimals)
  const tail = s.slice(-decimals).replace(/0+$/, '')
  return tail.length ? `${head}.${tail}` : head
}

function derivePrice(navRaw: bigint, supplyRaw: bigint): number {
  if (supplyRaw === BigInt(0)) return 1
  return Number(navRaw) / Number(supplyRaw)
}

function formatPercentFromBps(bps: number): string {
  const formatted = (bps / 100).toFixed(2)
  return formatted.replace(/\.?0+$/, "")
}

/** Detect wallet rejection errors */
function isWalletRejection(e: unknown): boolean {
  const msg = e instanceof Error ? e.message.toLowerCase() : String(e ?? '').toLowerCase()
  return msg.includes('user rejected') || msg.includes('user denied') || msg.includes('rejected the request')
}

interface Stringable {
  toString(): string;
}

interface PoolAccount {
  masterWallet: PublicKey;
  nav: Stringable;
  totalBrentSupply: Stringable;
  totalPendingClaims: Stringable;
}

interface PurchaseLimitConfigAccount {
  purchaseLimitUsdc: Stringable;
  totalDepositedUsdc: Stringable;
}

interface FeeConfigAccount {
  purchaseFeeBps: Stringable;
}

interface BuyPrimaryMethods {
  depositUsdc: (amount: BN) => {
    accounts: (accounts: {
      pool: PublicKey;
      userUsdc: PublicKey;
      userBrent: PublicKey;
      poolUsdc: PublicKey;
      brentMint: PublicKey;
      supportedUsdcConfig: PublicKey;
      purchaseLimitConfig: PublicKey;
      feeConfig: PublicKey;
      usdcMint: PublicKey;
      user: PublicKey;
      usdcTokenProgram: PublicKey;
      tokenProgram: PublicKey;
      systemProgram: PublicKey;
    }) => {
      instruction: () => Promise<TransactionInstruction>;
    };
  };
}

export function BuyPrimaryInterface() {
  const { connection } = useConnection()
  const wallet = useOptionalWallet()
  const publicKey = wallet?.publicKey ?? null
  const signTransaction = wallet?.signTransaction
  const signAllTransactions = wallet?.signAllTransactions
  const { showToast } = useToast();
  const [usdcAmount, setUsdcAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const txInFlight = useRef(false);
  const [poolState, setPoolState] = useState<{
    masterWallet: PublicKey;
    nav: bigint;
    totalBrentSupply: bigint;
    purchaseLimitUsdc: bigint;
    totalDepositedUsdc: bigint;
    purchaseFeeBps: number;
  } | null>(null);
  const [poolError, setPoolError] = useState<string | null>(null);

  const program = useMemo(
    () =>
      publicKey && signTransaction && signAllTransactions
        ? getProgram(connection, {
            publicKey,
            signTransaction,
            signAllTransactions,
          } satisfies ProgramWallet)
        : null,
    [connection, publicKey, signTransaction, signAllTransactions],
  );
  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), []);
  const bunkercashMintPda = useMemo(() => getBunkercashMintPda(PROGRAM_ID), []);
  const purchaseLimitConfigPda = useMemo(
    () => getPurchaseLimitConfigPda(PROGRAM_ID),
    []
  );
  const feeConfigPda = useMemo(() => getFeeConfigPda(PROGRAM_ID), []);
  const supportedUsdcConfigPda = useMemo(
    () => getSupportedUsdcConfigPda(PROGRAM_ID),
    []
  );
  const currentCluster = useMemo(
    () => getClusterFromEndpoint(connection.rpcEndpoint ?? ""),
    [connection],
  );
  const { usdcMint, usdcTokenProgram, error: usdcMintError } = useSupportedUsdcMint();

  const fetchPoolState = useCallback(async () => {
    if (!program || !connection) return;
    try {
      const accountApi = (program as Program<Idl>).account as {
        pool: { fetch: (key: PublicKey) => Promise<PoolAccount> };
        purchaseLimitConfig?: {
          fetch: (key: PublicKey) => Promise<PurchaseLimitConfigAccount>;
        };
        feeConfig?: {
          fetch: (key: PublicKey) => Promise<FeeConfigAccount>;
        };
      }
      const state = await accountApi.pool.fetch(poolPda);
      let purchaseLimitUsdc = BigInt(0);
      let totalDepositedUsdc = BigInt(0);
      let purchaseFeeBps = 0;

      if (accountApi.purchaseLimitConfig) {
        try {
          const purchaseLimitConfig = await accountApi.purchaseLimitConfig.fetch(
            purchaseLimitConfigPda
          );
          purchaseLimitUsdc = BigInt(purchaseLimitConfig.purchaseLimitUsdc.toString());
          totalDepositedUsdc = BigInt(purchaseLimitConfig.totalDepositedUsdc.toString());
        } catch {
          purchaseLimitUsdc = BigInt(0);
          totalDepositedUsdc = BigInt(0);
        }
      }

      if (accountApi.feeConfig) {
        try {
          const feeConfig = await accountApi.feeConfig.fetch(feeConfigPda);
          purchaseFeeBps = Number(feeConfig.purchaseFeeBps.toString());
        } catch {
          purchaseFeeBps = 0;
        }
      }

      const nav = BigInt(state.nav.toString())
      const totalPendingClaims = BigInt(state.totalPendingClaims.toString())
      const availableNav = nav > totalPendingClaims ? nav - totalPendingClaims : 0n

      setPoolState({
        masterWallet: state.masterWallet,
        nav: availableNav,
        totalBrentSupply: BigInt(state.totalBrentSupply.toString()),
        purchaseLimitUsdc,
        totalDepositedUsdc,
        purchaseFeeBps,
      });
      setPoolError(null);
    } catch {
      setPoolError("not_initialized");
      setPoolState(null);
    }
  }, [program, poolPda, connection, purchaseLimitConfigPda, feeConfigPda]);

  useEffect(() => {
    void fetchPoolState();
  }, [fetchPoolState]);

  useEffect(() => {
    if (!publicKey || !connection || !usdcMint || !usdcTokenProgram) return;
    const fetchBalance = async () => {
      try {
        const userUsdc = getAssociatedTokenAddressSync(
          usdcMint,
          publicKey,
          false,
          usdcTokenProgram,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );
        const balance = await connection.getTokenAccountBalance(userUsdc);
        setUsdcBalance(balance.value.uiAmountString ?? "0");
      } catch (e: unknown) {
        // If the account doesn't exist, it throws.
        // We can double check if it's an account-not-found error, but for now defaulting to 0 is safe for UI.
        if (e instanceof Error && e.message.includes("could not find account")) {
          setUsdcBalance("0");
        } else {
          console.error("Error fetching USDC balance:", e);
          setUsdcBalance("0");
        }
      }
    };
    void fetchBalance();
    const id = connection.onAccountChange(
      getAssociatedTokenAddressSync(
        usdcMint,
        publicKey,
        false,
        usdcTokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
      () => {
        // For simplicity, just refetch or parse info. Here avoiding intricate parsing for speed.
        void fetchBalance();
      },
    );
    return () => {
      connection.removeAccountChangeListener(id);
    };
  }, [publicKey, connection, usdcMint, usdcTokenProgram]);

  const pricePerToken = poolState
    ? derivePrice(poolState.nav, poolState.totalBrentSupply)
    : null;
  const supportsUsdcDeposits =
    !!usdcTokenProgram &&
    (usdcTokenProgram.equals(TOKEN_PROGRAM_ID) ||
      usdcTokenProgram.equals(TOKEN_2022_PROGRAM_ID))

  const usdcAmountRaw = useMemo(() => {
    return parseUiAmountToBaseUnits(usdcAmount, USDC_DECIMALS)
  }, [usdcAmount]);

  const usdcBalanceRaw = useMemo(() => {
    if (!usdcBalance) return null
    return parseUiAmountToBaseUnits(usdcBalance, USDC_DECIMALS)
  }, [usdcBalance])

  const tokenAmountRaw = useMemo(() => {
    if (!poolState || !usdcAmountRaw) return null;
    const purchaseFeeRaw = (usdcAmountRaw * BigInt(poolState.purchaseFeeBps)) / 10_000n;
    const netInvestmentRaw = usdcAmountRaw - purchaseFeeRaw;
    if (netInvestmentRaw <= 0n) return null;
    if (poolState.totalBrentSupply === BigInt(0) || poolState.nav === BigInt(0)) {
      return netInvestmentRaw;
    }
    return (netInvestmentRaw * poolState.totalBrentSupply) / poolState.nav;
  }, [poolState, usdcAmountRaw]);

  const purchaseFeeRaw = useMemo(() => {
    if (!poolState || !usdcAmountRaw) return null;
    return (usdcAmountRaw * BigInt(poolState.purchaseFeeBps)) / 10_000n;
  }, [poolState, usdcAmountRaw]);

  const netInvestmentRaw = useMemo(() => {
    if (!usdcAmountRaw || purchaseFeeRaw == null) return null;
    return usdcAmountRaw - purchaseFeeRaw;
  }, [usdcAmountRaw, purchaseFeeRaw]);

  const tokenAmountUi =
    tokenAmountRaw != null ? toUi(tokenAmountRaw, USDC_DECIMALS) : "";

  const remainingPurchaseCapacityRaw = useMemo(() => {
    if (!poolState) return null;
    if (poolState.purchaseLimitUsdc === BigInt(0)) return null;
    return poolState.purchaseLimitUsdc > poolState.totalDepositedUsdc
      ? poolState.purchaseLimitUsdc - poolState.totalDepositedUsdc
      : BigInt(0);
  }, [poolState]);

  // Input validation
  const inputError = useMemo(() => {
    if (!usdcAmount) return null;
    if (countFractionalDigits(usdcAmount) > USDC_DECIMALS) return "Max 6 decimal places";
    if (usdcAmountRaw == null) return "Enter a valid number";
    if (usdcAmountRaw < MIN_USDC_AMOUNT_RAW) return "Minimum amount is 0.01 USDC";
    if (usdcAmountRaw > MAX_USDC_AMOUNT_RAW) return "Maximum per transaction is 1M USDC";
    if (
      remainingPurchaseCapacityRaw != null &&
      usdcAmountRaw > remainingPurchaseCapacityRaw
    ) {
      return remainingPurchaseCapacityRaw === BigInt(0)
        ? "Global purchase cap reached"
        : `Only ${toUi(remainingPurchaseCapacityRaw, USDC_DECIMALS)} USDC of purchase capacity remains`;
    }
    if (usdcBalanceRaw != null && usdcAmountRaw > usdcBalanceRaw) {
      return "Insufficient USDC balance";
    }
    if (tokenAmountRaw != null && tokenAmountRaw <= 0n) {
      return "Amount is too small after fees and current pricing";
    }
    return null;
  }, [usdcAmount, usdcAmountRaw, usdcBalanceRaw, remainingPurchaseCapacityRaw, tokenAmountRaw]);

  const handleBuy = async () => {
    if (!usdcMint) {
      const msg = `Unsupported network: no configured USDC mint for ${currentCluster}.`;
      setError(msg);
      showToast(msg, "error");
      return;
    }
    if (usdcMintError) {
      setError(usdcMintError);
      showToast(usdcMintError, "error");
      return;
    }
    if (
      !wallet ||
      !program ||
      !publicKey ||
      !poolState ||
      !usdcAmountRaw ||
      usdcAmountRaw <= BigInt(0) ||
      !usdcTokenProgram
    ) {
      return;
    }

    // Prevent duplicate submissions
    if (txInFlight.current) return;
    txInFlight.current = true;

    // Check insufficient balance before sending
    if (usdcBalanceRaw != null && usdcAmountRaw > usdcBalanceRaw) {
      setError("Insufficient USDC balance");
      showToast("Insufficient USDC balance", "error");
      txInFlight.current = false;
      return;
    }

    setError(null);
    setTxSig(null);
    setLoading(true);
    try {
      // Resolve the configured settlement mint fresh at submit time so we do not
      // build the transaction with stale client state after an admin-side mint change.
      const configuredUsdcMint =
        (await fetchConfiguredUsdcMint(connection)) ?? usdcMint;
      const configuredUsdcTokenProgram = await fetchMintTokenProgram(
        connection,
        configuredUsdcMint,
      );

      if (
        !configuredUsdcTokenProgram ||
        (!configuredUsdcTokenProgram.equals(TOKEN_PROGRAM_ID) &&
          !configuredUsdcTokenProgram.equals(TOKEN_2022_PROGRAM_ID))
      ) {
        const msg =
          `Configured USDC mint ${configuredUsdcMint.toBase58()} is missing or owned by an unexpected token program on ${currentCluster}.`;
        setError(msg);
        showToast(msg, "error");
        return;
      }

      const userUsdc = getAssociatedTokenAddressSync(
        configuredUsdcMint,
        publicKey,
        false,
        configuredUsdcTokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      const poolUsdcVault = getAssociatedTokenAddressSync(
        configuredUsdcMint,
        poolPda,
        true,
        configuredUsdcTokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      const brentMintInfo = await connection.getAccountInfo(bunkercashMintPda);
      if (!brentMintInfo) {
        const msg =
          "The Bunker Cash mint PDA is not initialized for this program yet.";
        setError(msg);
        showToast(msg, "error");
        return;
      }
      const userBunkercash = getAssociatedTokenAddressSync(
        bunkercashMintPda,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );

      const createUserUsdcAtaIx =
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          userUsdc,
          publicKey,
          configuredUsdcMint,
          configuredUsdcTokenProgram,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );
      const createUserBunkercashAtaIx =
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          userBunkercash,
          publicKey,
          bunkercashMintPda,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );
      const createPoolUsdcVaultIx =
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          poolUsdcVault,
          poolPda,
          configuredUsdcMint,
          configuredUsdcTokenProgram,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );

      const methodsApi = (program as Program<Idl>).methods as unknown as BuyPrimaryMethods
      const depositUsdcIx = await methodsApi
        .depositUsdc(new BN(usdcAmountRaw.toString()))
        .accounts({
          pool: poolPda,
          userUsdc,
          userBrent: userBunkercash,
          poolUsdc: poolUsdcVault,
          brentMint: bunkercashMintPda,
          supportedUsdcConfig: supportedUsdcConfigPda,
          purchaseLimitConfig: purchaseLimitConfigPda,
          feeConfig: feeConfigPda,
          usdcMint: configuredUsdcMint,
          user: publicKey,
          usdcTokenProgram: configuredUsdcTokenProgram,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction().add(
        createUserUsdcAtaIx,
        createUserBunkercashAtaIx,
        createPoolUsdcVaultIx,
        depositUsdcIx,
      );
      const sig = await sendAndConfirmWalletTransaction({
        connection,
        wallet,
        transaction: tx,
      });

      setTxSig(sig);
      setUsdcAmount("");
      void fetchPoolState();
      invalidateTransactionCache();
      showToast(`Transaction submitted. Tx: ${sig.slice(0, 8)}…`, "success");
    } catch (e: unknown) {
      if (isWalletRejection(e)) {
        setError("Transaction was rejected in your wallet.");
        showToast("Transaction rejected by wallet", "warning");
      } else if (e instanceof SendTransactionError) {
        const logs = await e.getLogs(connection);
        if (logs?.length) {
          console.error('Deposit transaction logs:', logs);
        }
        const msg = e.message || "Transaction failed";
        setError(msg);
        showToast(msg, "error");
      } else {
        const msg = e instanceof Error ? e.message : "Transaction failed";
        setError(msg);
        showToast(msg, "error");
      }
    } finally {
      setLoading(false);
      txInFlight.current = false;
    }
  };

  if (!publicKey) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 text-center text-neutral-500">
        Complete access check and connect your wallet to continue.
      </div>
    )
  }

  if (poolError || !poolState) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 text-center">
        {!poolError ? (
          <p className="text-neutral-500">Loading pool price…</p>
        ) : poolError === 'not_initialized' ? (
          <div className="space-y-4 text-left max-w-lg mx-auto">
            <p className="text-neutral-400">
              The pool account is not initialized on this cluster yet.
            </p>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-4 py-3 text-xs text-neutral-400 space-y-1">
              <div>
                <span className="text-neutral-500">Program:</span> {PROGRAM_ID.toBase58()}
              </div>
              <div>
                <span className="text-neutral-500">Pool PDA:</span> {poolPda.toBase58()}
              </div>
            </div>
            <button
              onClick={() => void fetchPoolState()}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800"
            >
              Retry
            </button>
          </div>
        ) : (
          <p className="text-neutral-500">{poolError}</p>
        )}
      </div>
    )
  }

  if (!usdcMint) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <h3 className="text-lg font-semibold text-red-400">
            Unsupported Network
          </h3>
          <p className="text-neutral-400 max-w-md">
            This deployment currently supports a configured USDC mint on
            devnet/testnet only. Set `NEXT_PUBLIC_USDC_MINT` if you are using a
            different supported USDC mint.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
          <div>
            <div className="mb-2 text-xs uppercase tracking-wider text-neutral-500">
              Reference Rate
            </div>
            <div className="text-xl font-bold text-[#00FFB2] sm:text-2xl">
              ${pricePerToken != null ? pricePerToken.toFixed(2) : "—"} per
              token
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs uppercase tracking-wider text-neutral-500">
              Pricing Method
            </div>
            <div className="text-xl font-bold sm:text-2xl">Protocol-defined</div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs uppercase tracking-wider text-neutral-500">
              You provide
            </span>
            <span className="text-xs uppercase tracking-wider text-neutral-500">
              Balance: {usdcBalance ?? "—"}
            </span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <input
              type="text"
              value={usdcAmount}
              onChange={(e) => setUsdcAmount(e.target.value)}
              placeholder="0.00"
              className="min-w-0 flex-1 bg-transparent text-2xl font-bold outline-none placeholder:text-neutral-800 sm:text-3xl"
            />
            <div className="inline-flex w-fit items-center gap-2 self-start rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2.5 sm:self-auto sm:px-5 sm:py-3">
              <span className="text-sm font-semibold">USDC</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 -my-1 flex justify-center">
          <div className="rounded-xl border-2 border-neutral-800 bg-neutral-900 p-3">
            <ArrowDown className="h-5 w-5 text-neutral-500" />
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-neutral-500">
              You receive
            </span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1 bg-transparent text-2xl font-bold text-neutral-300 sm:text-3xl">
              {tokenAmountUi || "0"}
            </div>
            <div className="inline-flex w-fit items-center gap-2 self-start rounded-xl border-2 border-[#00FFB2] bg-[#00FFB2]/10 px-4 py-2.5 sm:self-auto sm:px-5 sm:py-3">
              <span className="text-sm font-semibold text-[#00FFB2]">
                Bunker Cash
              </span>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 text-sm">
            <div className="flex flex-col gap-1 text-neutral-400 sm:flex-row sm:items-center sm:justify-between">
              <span>Purchase fee</span>
              <span>
                {purchaseFeeRaw != null ? `${toUi(purchaseFeeRaw, USDC_DECIMALS)} USDC` : "0 USDC"} ({formatPercentFromBps(poolState.purchaseFeeBps)}%)
              </span>
            </div>
            <div className="mt-2 flex flex-col gap-1 text-white sm:flex-row sm:items-center sm:justify-between">
              <span>Net investment</span>
              <span>{netInvestmentRaw != null ? `${toUi(netInvestmentRaw, USDC_DECIMALS)} USDC` : "0 USDC"}</span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {usdcMintError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Failed to load configured USDC mint details: {usdcMintError}
        </div>
      )}
      {!usdcMintError && !supportsUsdcDeposits && usdcBalance && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
          Detected {usdcBalance} USDC in your wallet, but the configured mint is unsupported for this deployment. Ask the team to verify the selected USDC mint.
        </div>
      )}
      {txSig && (
        <div className="rounded-xl border border-[#00FFB2]/30 bg-[#00FFB2]/10 px-4 py-3 text-sm text-[#00FFB2]">
          Success. Tx: {txSig.slice(0, 8)}…{txSig.slice(-8)}
        </div>
      )}

      {inputError && usdcAmount && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
          {inputError}
        </div>
      )}

      <button
        onClick={handleBuy}
        disabled={
          loading ||
          !usdcAmountRaw ||
          usdcAmountRaw <= BigInt(0) ||
          !!inputError ||
          !usdcMint ||
          !supportsUsdcDeposits
        }
        className="w-full rounded-xl bg-[#00FFB2] py-4 text-base font-semibold text-black transition-all hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600 sm:py-5 sm:text-lg"
      >
        {loading ? "Processing…" : "Buy"}
      </button>

      <div className="text-center text-xs text-neutral-600 space-y-1">
        <div>
          Displayed values are interface values only and do not constitute a
          guarantee of value, liquidity, or future settlement.
        </div>
        <div className="opacity-50">
          Network:{" "}
          {currentCluster} |
          Mint: {usdcMint?.toBase58().slice(0, 4)}...
          {usdcMint?.toBase58().slice(-4)}
        </div>
      </div>
    </div>
  );
}
