"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SendTransactionError, SystemProgram, Transaction } from "@solana/web3.js";
import { AlertCircle, DollarSign, Info, Loader2, RefreshCw, Settings } from "lucide-react";
import { usePayoutVault } from "@/hooks/usePayoutVault";
import {
  getProgram,
  getReadonlyProgram,
  getPoolPda,
  getPurchaseLimitConfigPda,
  getSupportedUsdcConfigPda,
  fetchMintTokenProgram,
  PROGRAM_ID,
} from "@/lib/program";
import { formatUsdc, parseUsdcInput, shortPk } from "@/lib/master-operations";

interface Stringable {
  toString(): string;
}

interface PoolAccountLike {
  masterWallet: { toBase58(): string };
  nav: Stringable;
}

interface PurchaseLimitConfigLike {
  purchaseLimitUsdc: Stringable;
  totalDepositedUsdc: Stringable;
}

interface SupportedUsdcConfigLike {
  mint: { toBase58(): string };
}

interface PurchaseLimitsState {
  admin: string;
  navUsdcRaw: bigint;
  purchaseLimitUsdcRaw: bigint;
  totalDepositedUsdcRaw: bigint;
  supportedUsdcMint: string | null;
}

interface SetPurchaseLimitMethods {
  setPurchaseLimit: (amount: BN) => {
    accounts: (accounts: {
      pool: PublicKey;
      purchaseLimitConfig: PublicKey;
      admin: PublicKey;
      systemProgram: PublicKey;
    }) => {
      instruction: () => Promise<Transaction["instructions"][number]>;
    };
  };
}

interface SetSupportedUsdcMintMethods {
  setSupportedUsdcMint: () => {
    accounts: (accounts: {
      pool: PublicKey;
      supportedUsdcConfig: PublicKey;
      usdcMint: PublicKey;
      admin: PublicKey;
      usdcTokenProgram: PublicKey;
      systemProgram: PublicKey;
    }) => {
      instruction: () => Promise<Transaction["instructions"][number]>;
    };
  };
}

interface ProviderLike {
  sendAndConfirm: (tx: Transaction) => Promise<string>;
}

function parseLimitInput(value: string): bigint | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (/^0(?:\.0{0,6})?$/.test(trimmed)) return BigInt(0);
  return parseUsdcInput(trimmed);
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function PurchaseLimitsCard() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const {
    balance: vaultBalance,
    loading: vaultLoading,
    error: vaultError,
    refresh: refreshVault,
  } = usePayoutVault();

  const [state, setState] = useState<PurchaseLimitsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limitInput, setLimitInput] = useState("");
  const [mintInput, setMintInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), []);
  const purchaseLimitConfigPda = useMemo(
    () => getPurchaseLimitConfigPda(PROGRAM_ID),
    []
  );
  const supportedUsdcConfigPda = useMemo(
    () => getSupportedUsdcConfigPda(PROGRAM_ID),
    []
  );

  const program = useMemo(() => {
    if (wallet.publicKey) return getProgram(connection, wallet);
    return getReadonlyProgram(connection);
  }, [connection, wallet]);

  const fetchState = useCallback(async () => {
    if (!program) return;

    setLoading(true);
    setError(null);
    try {
      const accountApi = program.account as {
        pool: { fetch: (pubkey: typeof poolPda) => Promise<PoolAccountLike> };
        purchaseLimitConfig?: {
          fetch: (pubkey: typeof purchaseLimitConfigPda) => Promise<PurchaseLimitConfigLike>;
        };
        supportedUsdcConfig?: {
          fetch: (pubkey: typeof supportedUsdcConfigPda) => Promise<SupportedUsdcConfigLike>;
        };
      };

      const poolAccount = await accountApi.pool.fetch(poolPda);
      let purchaseLimitUsdcRaw = BigInt(0);
      let totalDepositedUsdcRaw = BigInt(0);
      let supportedUsdcMint: string | null = null;

      if (accountApi.purchaseLimitConfig) {
        try {
          const config = await accountApi.purchaseLimitConfig.fetch(
            purchaseLimitConfigPda
          );
          purchaseLimitUsdcRaw = BigInt(config.purchaseLimitUsdc.toString());
          totalDepositedUsdcRaw = BigInt(config.totalDepositedUsdc.toString());
        } catch {
          purchaseLimitUsdcRaw = BigInt(0);
          totalDepositedUsdcRaw = BigInt(0);
        }
      }

      if (accountApi.supportedUsdcConfig) {
        try {
          const config = await accountApi.supportedUsdcConfig.fetch(
            supportedUsdcConfigPda
          );
          supportedUsdcMint = config.mint.toBase58();
        } catch {
          supportedUsdcMint = null;
        }
      }

      setState({
        admin: poolAccount.masterWallet.toBase58(),
        navUsdcRaw: BigInt(poolAccount.nav.toString()),
        purchaseLimitUsdcRaw,
        totalDepositedUsdcRaw,
        supportedUsdcMint,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch purchase limit state");
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [poolPda, program, purchaseLimitConfigPda, supportedUsdcConfigPda]);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  useEffect(() => {
    if (!state || limitInput !== "") return;
    setLimitInput(
      state.purchaseLimitUsdcRaw === BigInt(0)
        ? "0"
        : formatUsdc(state.purchaseLimitUsdcRaw)
    );
  }, [state, limitInput]);

  useEffect(() => {
    if (!state || mintInput !== "" || !state.supportedUsdcMint) return;
    setMintInput(state.supportedUsdcMint);
  }, [state, mintInput]);

  const remainingCapacityRaw = useMemo(() => {
    if (!state) return null;
    if (state.purchaseLimitUsdcRaw === BigInt(0)) return null;
    return state.purchaseLimitUsdcRaw > state.totalDepositedUsdcRaw
      ? state.purchaseLimitUsdcRaw - state.totalDepositedUsdcRaw
      : BigInt(0);
  }, [state]);

  const utilizationPercent = useMemo(() => {
    if (!state || state.purchaseLimitUsdcRaw === BigInt(0)) return null;
    const used = Number(state.totalDepositedUsdcRaw);
    const cap = Number(state.purchaseLimitUsdcRaw);
    if (cap <= 0) return 0;
    return Math.min(Math.round((used / cap) * 100), 100);
  }, [state]);

  const parsedLimit = useMemo(() => parseLimitInput(limitInput), [limitInput]);
  const parsedMint = useMemo(() => {
    const trimmed = mintInput.trim();
    if (!trimmed) return null;
    try {
      return new PublicKey(trimmed);
    } catch {
      return null;
    }
  }, [mintInput]);
  const connectedWalletBase58 = wallet.publicKey?.toBase58() ?? null;
  const adminWalletBase58 = state?.admin ?? null;
  const isAuthorizedWallet =
    !!connectedWalletBase58 &&
    !!adminWalletBase58 &&
    connectedWalletBase58 === adminWalletBase58;

  const handleSave = async () => {
    if (!program || !wallet.publicKey || parsedLimit === null) return;

    setSubmitting(true);
    setError(null);
    setTxSuccess(null);

    try {
      const ix = await (program.methods as unknown as SetPurchaseLimitMethods)
        .setPurchaseLimit(new BN(parsedLimit.toString()))
        .accounts({
          pool: poolPda,
          purchaseLimitConfig: purchaseLimitConfigPda,
          admin: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction().add(ix);
      const provider = program.provider as ProviderLike;
      const signature = await provider.sendAndConfirm(tx);

      setTxSuccess(signature);
      await fetchState();
      await refreshVault();
    } catch (e: unknown) {
      if (e instanceof SendTransactionError) {
        const logs = await e.getLogs(connection);
        if (logs?.length) {
          console.error("Purchase limit transaction logs:", logs);
        }
      }
      setError(getErrorMessage(e, "Failed to update purchase limit"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleMintSave = async () => {
    if (!program || !wallet.publicKey || !parsedMint) return;

    setSubmitting(true);
    setError(null);
    setTxSuccess(null);

    try {
      const usdcTokenProgram = await fetchMintTokenProgram(connection, parsedMint);
      if (!usdcTokenProgram) {
        throw new Error("Selected mint is not owned by the SPL Token Program or Token-2022.");
      }
      const ix = await (program.methods as unknown as SetSupportedUsdcMintMethods)
        .setSupportedUsdcMint()
        .accounts({
          pool: poolPda,
          supportedUsdcConfig: supportedUsdcConfigPda,
          usdcMint: parsedMint,
          admin: wallet.publicKey,
          usdcTokenProgram,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction().add(ix);
      const provider = program.provider as ProviderLike;
      const signature = await provider.sendAndConfirm(tx);

      setTxSuccess(signature);
      await fetchState();
      await refreshVault();
    } catch (e: unknown) {
      if (e instanceof SendTransactionError) {
        const logs = await e.getLogs(connection);
        if (logs?.length) {
          console.error("Supported mint transaction logs:", logs);
        }
      }
      setError(getErrorMessage(e, "Failed to update supported USDC mint"));
    } finally {
      setSubmitting(false);
    }
  };

  const displayCap = !state
    ? "Unavailable"
    : state.purchaseLimitUsdcRaw === BigInt(0)
      ? "Unlimited"
      : `$${formatUsdc(state.purchaseLimitUsdcRaw)}`;

  const displayDeposited = !state
    ? "Unavailable"
    : `$${formatUsdc(state.totalDepositedUsdcRaw)}`;

  const displayRemaining = !state
    ? "Unavailable"
    : remainingCapacityRaw == null
      ? "Unlimited"
      : `$${formatUsdc(remainingCapacityRaw)}`;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Purchase Limits</h1>
        <button
          onClick={() => {
            void fetchState();
            void refreshVault();
          }}
          className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800/40 hover:text-white"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-4">
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Global Cap
          </div>
          <div className="font-mono text-2xl font-bold text-white">
            {loading ? "Loading..." : displayCap}
          </div>
          <div className="mt-2 text-xs text-neutral-500">
            `0` means unlimited aggregate deposits
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Total Deposited
          </div>
          <div className="font-mono text-2xl font-bold text-white">
            {loading ? "Loading..." : displayDeposited}
          </div>
          <div className="mt-2 text-xs text-neutral-500">
            Cumulative USDC accepted by `deposit_usdc`
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Remaining Capacity
          </div>
          <div className="font-mono text-2xl font-bold text-[#00FFB2]">
            {loading ? "Loading..." : displayRemaining}
          </div>
          <div className="mt-2 text-xs text-neutral-500">
            Further purchases stop when this reaches zero
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            <DollarSign className="h-4 w-4" />
            Pool Snapshot
          </div>
          <div className="space-y-2 text-xs text-neutral-400">
            <div className="flex items-center justify-between">
              <span>Supported Mint</span>
              <span className="font-mono text-white">
                {loading
                  ? "Loading..."
                  : state?.supportedUsdcMint
                    ? shortPk(state.supportedUsdcMint)
                    : "Unset"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Net Asset Value</span>
              <span className="font-mono text-white">
                {loading || !state ? "Loading..." : `$${formatUsdc(state.navUsdcRaw)}`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Payout Vault</span>
              <span className="font-mono text-white">
                {vaultLoading
                  ? "Loading..."
                  : vaultError
                    ? "Unavailable"
                    : `$${vaultBalance ?? "0.00"}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {utilizationPercent != null && (
        <div className="mb-6 rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
          <div className="mb-2.5 flex items-center justify-between text-xs text-neutral-500">
            <span>{utilizationPercent}% of aggregate cap used</span>
            <span>{displayDeposited} / {displayCap}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-[#00FFB2] transition-all duration-500"
              style={{ width: `${utilizationPercent}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </div>
      )}

      {txSuccess && (
        <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          Configuration updated successfully. Tx: {shortPk(txSuccess)}
        </div>
      )}

      {wallet.publicKey && adminWalletBase58 && !isAuthorizedWallet && (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
          Connected wallet {shortPk(wallet.publicKey.toBase58())} is not the current pool admin.
        </div>
      )}

      <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
        <div className="mb-5 flex items-center gap-2">
          <Settings className="h-4 w-4 text-neutral-500" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Update Aggregate Deposit Cap
          </span>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#00FFB2]" />
            <div className="space-y-2 text-sm text-neutral-300">
              <p>
                This cap applies to all primary purchases combined. If you set it to
                `100`, the program will stop accepting further buys after
                aggregate deposits reach 100 USDC.
              </p>
              <p className="text-neutral-500">
                Set the value to `0` to remove the limit.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-xs text-neutral-400">
            Purchase Limit (USDC)
          </label>
          <input
            type="text"
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            placeholder="0 for unlimited"
            className="h-10 w-full rounded-lg border border-neutral-700/60 bg-neutral-800/60 px-3 font-mono text-sm text-white focus:border-[#00FFB2]/50 focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={!isAuthorizedWallet || parsedLimit === null || submitting}
          className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#00FFB2] text-sm font-medium text-black transition-colors hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Saving..." : "Save Purchase Limit"}
        </button>

        {state && (
          <div className="mt-6 border-t border-neutral-800/60 pt-6">
            <label className="mb-2 block text-xs text-neutral-400">
              Supported USDC Mint
            </label>
            <input
              type="text"
              value={mintInput}
              onChange={(e) => setMintInput(e.target.value)}
              placeholder="Enter mint pubkey"
              className="h-10 w-full rounded-lg border border-neutral-700/60 bg-neutral-800/60 px-3 font-mono text-sm text-white focus:border-[#00FFB2]/50 focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50"
            />
            <p className="mt-2 text-xs text-neutral-500">
              Future deposits, settlements, and master operations validate against this stored mint.
            </p>
            <button
              onClick={handleMintSave}
              disabled={!isAuthorizedWallet || parsedMint === null || submitting}
              className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-neutral-200 text-sm font-medium text-black transition-colors hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-600"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Saving..." : "Save Supported Mint"}
            </button>
          </div>
        )}

        {state && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
            <div className="text-xs text-neutral-400">
              Current pool admin: <span className="font-mono text-neutral-200">{state.admin}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
