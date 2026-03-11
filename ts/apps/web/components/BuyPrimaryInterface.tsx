'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { Idl, Program } from '@coral-xyz/anchor'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SendTransactionError, SystemProgram, Transaction, type TransactionInstruction } from '@solana/web3.js'
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
  getBunkercashMintPda,
  getPoolPda,
  getProgram,
  PROGRAM_ID,
} from "@/lib/program";
import { countFractionalDigits, parseUiAmountToBaseUnits } from "@/lib/amounts";
import { getClusterFromEndpoint, getUsdcMintForCluster } from "@/lib/constants";
import { ArrowDown, AlertCircle } from "lucide-react";
import { BN } from '@coral-xyz/anchor'
import { useToast } from "@/components/ui/ToastContext";

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

/** Detect wallet rejection errors */
function isWalletRejection(e: unknown): boolean {
  const msg = e instanceof Error ? e.message.toLowerCase() : String(e ?? '').toLowerCase()
  return msg.includes('user rejected') || msg.includes('user denied') || msg.includes('rejected the request') || msg.includes('transaction was not confirmed')
}

interface Stringable {
  toString(): string;
}

interface PoolAccount {
  masterWallet: PublicKey;
  nav: Stringable;
  totalBrentSupply: Stringable;
}

interface BuyPrimaryMethods {
  depositUsdc: (amount: BN) => {
    accounts: (accounts: {
      pool: PublicKey;
      userUsdc: PublicKey;
      userBrent: PublicKey;
      poolUsdc: PublicKey;
      brentMint: PublicKey;
      usdcMint: PublicKey;
      user: PublicKey;
      tokenProgram: PublicKey;
      systemProgram: PublicKey;
    }) => {
      instruction: () => Promise<TransactionInstruction>;
    };
  };
}

export function BuyPrimaryInterface() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const { showToast } = useToast();
  const [usdcAmount, setUsdcAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [usdcTokenProgram, setUsdcTokenProgram] = useState<PublicKey | null>(null);
  const txInFlight = useRef(false);
  const [poolState, setPoolState] = useState<{
    masterWallet: PublicKey;
    nav: bigint;
    totalBrentSupply: bigint;
  } | null>(null);
  const [poolError, setPoolError] = useState<string | null>(null);

  const program = useMemo(
    () => (wallet.publicKey ? getProgram(connection, wallet) : null),
    [connection, wallet],
  );
  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), []);
  const bunkercashMintPda = useMemo(() => getBunkercashMintPda(PROGRAM_ID), []);

  const usdcMint = useMemo(() => {
    if (!connection) return null;
    const endpoint = connection.rpcEndpoint ?? "";
    const cluster = getClusterFromEndpoint(endpoint);
    return getUsdcMintForCluster(cluster);
  }, [connection]);

  useEffect(() => {
    if (!connection || !usdcMint) {
      setUsdcTokenProgram(null)
      return
    }

    const detectMintProgram = async () => {
      try {
        const mintInfo = await connection.getAccountInfo(usdcMint)
        setUsdcTokenProgram(mintInfo?.owner ?? null)
      } catch {
        setUsdcTokenProgram(null)
      }
    }

    void detectMintProgram()
  }, [connection, usdcMint])

  const fetchPoolState = useCallback(async () => {
    if (!program || !connection) return;
    try {
      const accountApi = (program as Program<Idl>).account as {
        pool: { fetch: (key: PublicKey) => Promise<PoolAccount> };
      }
      const state = await accountApi.pool.fetch(poolPda);
      setPoolState({
        masterWallet: state.masterWallet,
        nav: BigInt(state.nav.toString()),
        totalBrentSupply: BigInt(state.totalBrentSupply.toString()),
      });
      setPoolError(null);
    } catch {
      setPoolError("not_initialized");
      setPoolState(null);
    }
  }, [program, poolPda, connection]);

  useEffect(() => {
    void fetchPoolState();
  }, [fetchPoolState]);

  useEffect(() => {
    if (!wallet.publicKey || !connection || !usdcMint || !usdcTokenProgram) return;
    const fetchBalance = async () => {
      try {
        const userUsdc = getAssociatedTokenAddressSync(
          usdcMint,
          wallet.publicKey!,
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
        wallet.publicKey!,
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
  }, [wallet.publicKey, connection, usdcMint, usdcTokenProgram]);

  const pricePerToken = poolState
    ? derivePrice(poolState.nav, poolState.totalBrentSupply)
    : null;
  const supportsUsdcDeposits =
    !!usdcTokenProgram && usdcTokenProgram.equals(TOKEN_2022_PROGRAM_ID)

  const usdcAmountRaw = useMemo(() => {
    return parseUiAmountToBaseUnits(usdcAmount, USDC_DECIMALS)
  }, [usdcAmount]);

  const usdcBalanceRaw = useMemo(() => {
    if (!usdcBalance) return null
    return parseUiAmountToBaseUnits(usdcBalance, USDC_DECIMALS)
  }, [usdcBalance])

  const tokenAmountRaw = useMemo(() => {
    if (!poolState || !usdcAmountRaw) return null;
    if (poolState.totalBrentSupply === BigInt(0) || poolState.nav === BigInt(0)) {
      return usdcAmountRaw;
    }
    return (usdcAmountRaw * poolState.totalBrentSupply) / poolState.nav;
  }, [poolState, usdcAmountRaw]);

  const tokenAmountUi =
    tokenAmountRaw != null ? toUi(tokenAmountRaw, USDC_DECIMALS) : "";

  // Input validation
  const inputError = useMemo(() => {
    if (!usdcAmount) return null;
    if (countFractionalDigits(usdcAmount) > USDC_DECIMALS) return "Max 6 decimal places";
    if (usdcAmountRaw == null) return "Enter a valid number";
    if (usdcAmountRaw < MIN_USDC_AMOUNT_RAW) return "Minimum amount is 0.01 USDC";
    if (usdcAmountRaw > MAX_USDC_AMOUNT_RAW) return "Maximum specific limit is 1M USDC";
    if (usdcBalanceRaw != null && usdcAmountRaw > usdcBalanceRaw) {
      return "Insufficient USDC balance";
    }
    return null;
  }, [usdcAmount, usdcAmountRaw, usdcBalanceRaw]);

  const handleBuy = async () => {
    if (
      !program ||
      !wallet.publicKey ||
      !poolState ||
      !usdcAmountRaw ||
      usdcAmountRaw <= BigInt(0) ||
      !usdcMint ||
      !usdcTokenProgram
    )
      return;

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
      if (!supportsUsdcDeposits) {
        const msg =
          "Detected legacy SPL USDC for this wallet. The current contract only accepts Token-2022 USDC.";
        setError(msg);
        showToast(msg, "error");
        return;
      }

      const userUsdc = getAssociatedTokenAddressSync(
        usdcMint,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      const poolUsdcVault = getAssociatedTokenAddressSync(
        usdcMint,
        poolPda,
        true,
        TOKEN_2022_PROGRAM_ID,
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
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );

      const createUserUsdcAtaIx =
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          userUsdc,
          wallet.publicKey,
          usdcMint,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );
      const createPoolUsdcAtaIx =
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          poolUsdcVault,
          poolPda,
          usdcMint,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );
      const createUserBunkercashAtaIx =
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          userBunkercash,
          wallet.publicKey,
          bunkercashMintPda,
          TOKEN_2022_PROGRAM_ID,
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
          usdcMint,
          user: wallet.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction().add(
        createUserUsdcAtaIx,
        createPoolUsdcAtaIx,
        createUserBunkercashAtaIx,
        depositUsdcIx,
      );
      const sig = await (
        program.provider as {
          sendAndConfirm: (tx: Transaction) => Promise<string>;
        }
      ).sendAndConfirm(tx);

      setTxSig(sig);
      setUsdcAmount("");
      showToast(`Deposit successful! Tx: ${sig.slice(0, 8)}…`, "success");
      void fetchPoolState();
      // Invalidate transactions cache so Transactions tab fetches fresh data
      const { invalidateTransactionCache } =
        await import("@/hooks/useMyTransactions");
      invalidateTransactionCache();
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

  if (!wallet.publicKey) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 text-center text-neutral-500">
        Connect your wallet to view the current Bunker Cash price.
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
            Only USDC on the Solana network is supported for payments. Please
            switch to a supported Solana cluster (Mainnet, Devnet) and try
            again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="mb-2 text-xs uppercase tracking-wider text-neutral-500">
              Current price
            </div>
            <div className="text-2xl font-bold text-[#00FFB2]">
              ${pricePerToken != null ? pricePerToken.toFixed(4) : "—"} per
              token
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs uppercase tracking-wider text-neutral-500">
              Pricing model
            </div>
            <div className="text-2xl font-bold">NAV derived</div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-neutral-500">
              You pay
              <span className="ml-2 font-normal text-neutral-600 normal-case tracking-normal">
                (Max 1M USDC)
              </span>
            </span>
            <span className="text-xs uppercase tracking-wider text-neutral-500">
              Balance: {usdcBalance ?? "—"}
            </span>
          </div>
          <div className="flex flex-1 items-center gap-4">
            <input
              type="text"
              value={usdcAmount}
              onChange={(e) => setUsdcAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent text-3xl font-bold outline-none placeholder:text-neutral-800"
            />
            <div className="flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800 px-5 py-3">
              <span className="text-sm font-semibold">USDC</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 -my-1 flex justify-center">
          <div className="rounded-xl border-2 border-neutral-800 bg-neutral-900 p-3">
            <ArrowDown className="h-5 w-5 text-neutral-500" />
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-neutral-500">
              You receive
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-transparent text-3xl font-bold text-neutral-300">
              {tokenAmountUi || "0"}
            </div>
            <div className="flex items-center gap-2 rounded-xl border-2 border-[#00FFB2] bg-[#00FFB2]/10 px-5 py-3">
              <span className="text-sm font-semibold text-[#00FFB2]">
                Bunker Cash
              </span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {!supportsUsdcDeposits && usdcBalance && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
          Detected {usdcBalance} devnet USDC in your wallet, but it is on the legacy SPL token program. This contract currently accepts Token-2022 USDC only.
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
          !supportsUsdcDeposits
        }
        className="w-full rounded-xl bg-[#00FFB2] py-5 text-lg font-semibold text-black transition-all hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600"
      >
        {loading ? "Processing…" : "Deposit USDC"}
      </button>

      <div className="text-center text-xs text-neutral-600 space-y-1">
        <div>
          Price is derived from on-chain NAV and outstanding supply
        </div>
        <div className="opacity-50">
          Network:{" "}
          {getClusterFromEndpoint(connection.rpcEndpoint ?? "")} |
          Mint: {usdcMint?.toBase58().slice(0, 4)}...
          {usdcMint?.toBase58().slice(-4)}
        </div>
      </div>
    </div>
  );
}
