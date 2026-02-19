'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
  getBunkercashMintPda,
  getPoolPda,
  getPoolSignerPda,
  getProgram,
  PROGRAM_ID,
} from "@/lib/program";
import { getClusterFromEndpoint, getUsdcMintForCluster } from "@/lib/constants";
import { ArrowDown, AlertCircle } from "lucide-react";
import { BN } from '@coral-xyz/anchor'
import { useToast } from "@/components/ui/ToastContext";

const USDC_DECIMALS = 6
const BUNKERCASH_DECIMALS = 9;

function toUi(amount: bigint, decimals: number): string {
  const s = amount.toString().padStart(decimals + 1, '0')
  const head = s.slice(0, -decimals)
  const tail = s.slice(-decimals).replace(/0+$/, '')
  return tail.length ? `${head}.${tail}` : head
}

/** Detect wallet rejection errors */
function isWalletRejection(e: any): boolean {
  const msg = (e?.message ?? e?.toString?.() ?? '').toLowerCase()
  return msg.includes('user rejected') || msg.includes('user denied') || msg.includes('rejected the request') || msg.includes('transaction was not confirmed')
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
  const txInFlight = useRef(false);
  const [poolState, setPoolState] = useState<{
    priceUsdcPerToken: BN;
    admin: PublicKey;
  } | null>(null);
  const [poolError, setPoolError] = useState<string | null>(null);

  const program = useMemo(
    () => (wallet.publicKey ? getProgram(connection, wallet) : null),
    [connection, wallet],
  );
  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), []);
  const bunkercashMintPda = useMemo(() => getBunkercashMintPda(PROGRAM_ID), []);
  const poolSignerPda = useMemo(
    () => getPoolSignerPda(poolPda, PROGRAM_ID),
    [poolPda],
  );

  const usdcMint = useMemo(() => {
    if (!connection) return null;
    // connection structure might vary, safer to cast or check
    const endpoint = (connection as any).rpcEndpoint ?? "";
    const cluster = getClusterFromEndpoint(endpoint);
    return getUsdcMintForCluster(cluster);
  }, [connection]);

  const fetchPoolState = useCallback(async () => {
    if (!program || !connection) return;
    try {
      const state = await (
        program.account as {
          poolState: {
            fetch: (
              key: PublicKey,
            ) => Promise<{ priceUsdcPerToken: BN; admin: PublicKey }>;
          };
        }
      ).poolState.fetch(poolPda);
      setPoolState({
        priceUsdcPerToken: state.priceUsdcPerToken as BN,
        admin: state.admin as PublicKey,
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
    if (!wallet.publicKey || !connection || !usdcMint) return;
    const fetchBalance = async () => {
      try {
        const userUsdc = getAssociatedTokenAddressSync(
          usdcMint,
          wallet.publicKey!,
          false,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );
        const balance = await connection.getTokenAccountBalance(userUsdc);
        setUsdcBalance(balance.value.uiAmountString ?? "0");
      } catch (e: any) {
        // If the account doesn't exist, it throws.
        // We can double check if it's an account-not-found error, but for now defaulting to 0 is safe for UI.
        if (e.message?.includes("could not find account")) {
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
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
      (info) => {
        // For simplicity, just refetch or parse info. Here avoiding intricate parsing for speed.
        void fetchBalance();
      },
    );
    return () => {
      connection.removeAccountChangeListener(id);
    };
  }, [wallet.publicKey, connection, usdcMint]);

  const pricePerToken = poolState
    ? Number(poolState.priceUsdcPerToken) / 10 ** USDC_DECIMALS
    : null;

  const usdcAmountRaw = useMemo(() => {
    const v = parseFloat(usdcAmount);
    if (Number.isNaN(v) || v <= 0) return null;
    return BigInt(Math.round(v * 10 ** USDC_DECIMALS));
  }, [usdcAmount]);

  const tokenAmountRaw = useMemo(() => {
    if (!poolState || !usdcAmountRaw) return null;
    const price = poolState.priceUsdcPerToken;
    const scale = BigInt(10 ** BUNKERCASH_DECIMALS);
    const tokenAmount =
      (BigInt(usdcAmountRaw.toString()) * scale) / BigInt(price.toString());
    return tokenAmount;
  }, [poolState, usdcAmountRaw]);

  const tokenAmountUi =
    tokenAmountRaw != null ? toUi(tokenAmountRaw, BUNKERCASH_DECIMALS) : "";

  // Input validation
  const inputError = useMemo(() => {
    if (!usdcAmount) return null;
    const v = parseFloat(usdcAmount);
    if (Number.isNaN(v)) return "Enter a valid number";
    if (v < 0.01) return "Minimum amount is 0.01 USDC";
    if (v > 1000000) return "Maximum specific limit is 1M USDC";
    // Check max 6 decimal places
    const parts = usdcAmount.split(".");
    if (parts[1] && parts[1].length > 6) return "Max 6 decimal places";
    if (usdcBalance && v > parseFloat(usdcBalance))
      return "Insufficient USDC balance";
    return null;
  }, [usdcAmount, usdcBalance]);

  const handleBuy = async () => {
    if (
      !program ||
      !wallet.publicKey ||
      !poolState ||
      !usdcAmountRaw ||
      usdcAmountRaw <= BigInt(0) ||
      !usdcMint
    )
      return;

    // Prevent duplicate submissions
    if (txInFlight.current) return;
    txInFlight.current = true;

    // Check insufficient balance before sending
    if (usdcBalance && parseFloat(usdcAmount) > parseFloat(usdcBalance)) {
      setError("Insufficient USDC balance");
      showToast("Insufficient USDC balance", "error");
      txInFlight.current = false;
      return;
    }

    setError(null);
    setTxSig(null);
    setLoading(true);
    try {
      const userUsdc = getAssociatedTokenAddressSync(
        usdcMint,
        wallet.publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      const payoutUsdcVault = getAssociatedTokenAddressSync(
        usdcMint,
        poolSignerPda,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
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
          TOKEN_PROGRAM_ID,
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

      const buyPrimaryIx = await (program.methods as any)
        .buyPrimary(new BN(usdcAmountRaw.toString()))
        .accounts({
          pool: poolPda,
          poolSigner: poolSignerPda,
          bunkercashMint: bunkercashMintPda,
          user: wallet.publicKey,
          usdcMint,
          userUsdc,
          payoutUsdcVault,
          userBunkercash,
          usdcTokenProgram: TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction().add(
        createUserUsdcAtaIx,
        createUserBunkercashAtaIx,
        buyPrimaryIx,
      );
      const sig = await (
        program.provider as {
          sendAndConfirm: (tx: Transaction) => Promise<string>;
        }
      ).sendAndConfirm(tx);

      setTxSig(sig);
      setUsdcAmount("");
      showToast(`Purchase successful! Tx: ${sig.slice(0, 8)}…`, "success");
      // Invalidate transactions cache so Transactions tab fetches fresh data
      const { invalidateTransactionCache } =
        await import("@/hooks/useMyTransactions");
      invalidateTransactionCache();
    } catch (e: any) {
      if (isWalletRejection(e)) {
        setError("Transaction was rejected in your wallet.");
        showToast("Transaction rejected by wallet", "warning");
      } else {
        const msg = e?.message ?? "Transaction failed";
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
        Connect your wallet to buy Bunker Cash at the fixed primary price.
      </div>
    )
  }

  if (poolError || !poolState) {
    const isNotInitialized = poolError === 'not_initialized'
    const rpcEndpoint =
      (connection as unknown as { rpcEndpoint?: string }).rpcEndpoint ??
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
      'unknown'
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 text-center">
        {!poolError ? (
          <p className="text-neutral-500">Loading primary sale…</p>
        ) : isNotInitialized ? (
          <div className="space-y-4 text-left max-w-lg mx-auto">
            <p className="text-neutral-400">
              Primary sale is not set up on this cluster yet. On devnet, run the bootstrap script once to create the pool and set the price:
            </p>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-4 py-3 text-xs text-neutral-400 space-y-1">
              <div>
                <span className="text-neutral-500">RPC:</span> {rpcEndpoint}
              </div>
              <div>
                <span className="text-neutral-500">Program:</span> {PROGRAM_ID.toBase58()}
              </div>
              <div>
                <span className="text-neutral-500">Pool PDA:</span> {poolPda.toBase58()}
              </div>
            </div>
            <pre className="bg-neutral-900 border border-neutral-700 rounded-lg p-4 text-xs text-neutral-300 overflow-x-auto text-left">
              {`cd rs
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json
npx ts-node -P tsconfig.json scripts/bootstrap-fixed-price.ts`}
            </pre>
            <p className="text-neutral-500 text-sm">
              That script initializes the pool and Bunker Cash mint at a fixed price (1 USDC = 1 token) and can run a test buy. After that, this page will show the fixed price and you can buy from the web app using your devnet USDC.
            </p>
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => void fetchPoolState()}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800"
              >
                Retry
              </button>
              <div className="text-xs text-neutral-600">
                Tip: after running the script, refresh this page.
              </div>
            </div>
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
              Fixed price
            </div>
            <div className="text-2xl font-bold text-[#00FFB2]">
              ${pricePerToken != null ? pricePerToken.toFixed(4) : "—"} per
              token
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs uppercase tracking-wider text-neutral-500">
              Primary sale
            </div>
            <div className="text-2xl font-bold">Fixed-price mint</div>
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
          !!inputError
        }
        className="w-full rounded-xl bg-[#00FFB2] py-5 text-lg font-semibold text-black transition-all hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600"
      >
        {loading ? "Processing…" : "Buy Bunker Cash"}
      </button>

      <div className="text-center text-xs text-neutral-600 space-y-1">
        <div>
          Pay with USDC (SPL legacy) · Fixed-price primary sale → Bunker Cash
        </div>
        <div className="opacity-50">
          Network:{" "}
          {getClusterFromEndpoint((connection as any).rpcEndpoint ?? "")} |
          Mint: {usdcMint?.toBase58().slice(0, 4)}...
          {usdcMint?.toBase58().slice(-4)}
        </div>
      </div>
    </div>
  );
}
