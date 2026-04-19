"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { AlertCircle, Info, Loader2, Percent, RefreshCw, ShieldAlert } from "lucide-react";
import {
  formatPercentFromBps,
  parseFeePercentInput,
  shortPk,
} from "@/lib/master-operations";
import {
  getFeeConfigPda,
  getPoolPda,
  getProgram,
  PROGRAM_ID,
} from "@/lib/program";
import { sendAndConfirmWalletTransaction } from "@/lib/sendAndConfirmWalletTransaction";

interface FeeConfigLike {
  adminWallet: string;
  purchaseFeeBps: number;
  claimFeeBps: number;
}

interface FeesState {
  admin: string;
  purchaseFeeBps: number;
  claimFeeBps: number;
}

interface SetFeeConfigMethods {
  setFeeConfig: (purchaseFeeBps: number, claimFeeBps: number) => {
    accounts: (accounts: {
      pool: PublicKey;
      feeConfig: PublicKey;
      admin: PublicKey;
      systemProgram: PublicKey;
    }) => {
      instruction: () => Promise<Transaction["instructions"][number]>;
    };
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function FeesCard() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [state, setState] = useState<FeesState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchaseFeeInput, setPurchaseFeeInput] = useState("");
  const [claimFeeInput, setClaimFeeInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), []);
  const feeConfigPda = useMemo(() => getFeeConfigPda(PROGRAM_ID), []);
  const program = useMemo(
    () => (wallet.publicKey ? getProgram(connection, wallet) : null),
    [connection, wallet],
  );

  const fetchState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fees", { cache: "no-store" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `fees: ${res.status}`);
      }
      const feeConfig = (await res.json()) as FeeConfigLike;

      setState({
        admin: feeConfig.adminWallet,
        purchaseFeeBps: feeConfig.purchaseFeeBps,
        claimFeeBps: feeConfig.claimFeeBps,
      });
    } catch (e: unknown) {
      setState(null);
      setError(getErrorMessage(e, "Failed to fetch fee configuration"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  useEffect(() => {
    if (!state || purchaseFeeInput !== "") return;
    setPurchaseFeeInput(formatPercentFromBps(state.purchaseFeeBps));
  }, [state, purchaseFeeInput]);

  useEffect(() => {
    if (!state || claimFeeInput !== "") return;
    setClaimFeeInput(formatPercentFromBps(state.claimFeeBps));
  }, [state, claimFeeInput]);

  const parsedPurchaseFeeBps = useMemo(
    () => parseFeePercentInput(purchaseFeeInput, { allowZero: true, maxBps: 1_000 }),
    [purchaseFeeInput],
  );
  const parsedClaimFeeBps = useMemo(
    () => parseFeePercentInput(claimFeeInput, { allowZero: true, maxBps: 1_000 }),
    [claimFeeInput],
  );

  const connectedWalletBase58 = wallet.publicKey?.toBase58() ?? null;
  const adminWalletBase58 = state?.admin ?? null;
  const isAuthorizedWallet =
    !!connectedWalletBase58 &&
    !!adminWalletBase58 &&
    connectedWalletBase58 === adminWalletBase58;

  const hasChanges =
    !!state &&
    parsedPurchaseFeeBps !== null &&
    parsedClaimFeeBps !== null &&
    (parsedPurchaseFeeBps !== state.purchaseFeeBps ||
      parsedClaimFeeBps !== state.claimFeeBps);

  const handleSave = async () => {
    if (
      !program ||
      !wallet.publicKey ||
      parsedPurchaseFeeBps === null ||
      parsedClaimFeeBps === null
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setTxSuccess(null);

    try {
      const ix = await (program.methods as unknown as SetFeeConfigMethods)
        .setFeeConfig(parsedPurchaseFeeBps, parsedClaimFeeBps)
        .accounts({
          pool: poolPda,
          feeConfig: feeConfigPda,
          admin: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction();
      tx.add(ix);

      const signature = await sendAndConfirmWalletTransaction({
        connection,
        wallet,
        transaction: tx,
      });

      setTxSuccess(signature);
      setPurchaseFeeInput("");
      setClaimFeeInput("");
      await fetchState();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to update fee configuration"));
    } finally {
      setSubmitting(false);
    }
  };

  const validationError =
    purchaseFeeInput !== "" && parsedPurchaseFeeBps === null
      ? "Purchase fee must be a valid percentage between 0 and 10 with up to 2 decimals."
      : claimFeeInput !== "" && parsedClaimFeeBps === null
        ? "Claim fee must be a valid percentage between 0 and 10 with up to 2 decimals."
        : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Fees</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Configure purchase and claim fees stored on-chain in basis points.
        </p>
      </div>

      <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
        <div className="mb-5 flex items-center gap-2">
          <Percent className="h-4 w-4 text-neutral-500" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Fee Configuration
          </span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading fee state...
          </div>
        ) : !state ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Unable to load the current fee configuration.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Purchase Fee</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {formatPercentFromBps(state.purchaseFeeBps)}%
                </p>
                <p className="mt-1 text-xs text-neutral-500">{state.purchaseFeeBps} bps live</p>
              </div>

              <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Claim Fee</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {formatPercentFromBps(state.claimFeeBps)}%
                </p>
                <p className="mt-1 text-xs text-neutral-500">{state.claimFeeBps} bps live</p>
              </div>

              <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Admin Wallet</p>
                <p className="mt-2 text-sm font-medium text-white">{shortPk(state.admin)}</p>
                <p className="mt-1 text-xs text-neutral-500">Only this wallet can update fees.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div>
                <label htmlFor="purchaseFee" className="mb-2 block text-xs font-medium text-neutral-400">
                  Purchase Fee %
                </label>
                <div className="relative">
                  <input
                    id="purchaseFee"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={purchaseFeeInput}
                    onChange={(e) => setPurchaseFeeInput(e.target.value)}
                    className={`w-full rounded-lg border bg-neutral-950/60 px-4 py-3 pr-10 font-mono text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-[#00FFB2]/50 focus:ring-1 focus:ring-[#00FFB2]/20 ${
                      purchaseFeeInput !== "" && parsedPurchaseFeeBps === null ? "border-red-500/50" : "border-neutral-800"
                    }`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                    %
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="claimFee" className="mb-2 block text-xs font-medium text-neutral-400">
                  Claim Fee %
                </label>
                <div className="relative">
                  <input
                    id="claimFee"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={claimFeeInput}
                    onChange={(e) => setClaimFeeInput(e.target.value)}
                    className={`w-full rounded-lg border bg-neutral-950/60 px-4 py-3 pr-10 font-mono text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-[#00FFB2]/50 focus:ring-1 focus:ring-[#00FFB2]/20 ${
                      claimFeeInput !== "" && parsedClaimFeeBps === null ? "border-red-500/50" : "border-neutral-800"
                    }`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                    %
                  </span>
                </div>
              </div>
            </div>

            {validationError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {validationError}
              </div>
            )}

            {!wallet.publicKey ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                Connect the admin wallet to update fees.
              </div>
            ) : !isAuthorizedWallet ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                Connected wallet {shortPk(connectedWalletBase58 ?? "")} does not match the on-chain admin{" "}
                {shortPk(state.admin)}.
              </div>
            ) : null}

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {txSuccess && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                Fee configuration updated. Transaction: {shortPk(txSuccess)}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => void fetchState()}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:text-white"
                type="button"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={!isAuthorizedWallet || !hasChanges || !!validationError || submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-[#00FFB2] px-5 py-2.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
                type="button"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                {submitting ? "Saving..." : "Save Fees"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#00FFB2]" />
          <div className="space-y-2 text-sm text-neutral-300">
            <p>
              Purchase fees reduce the number of new BunkerCash tokens minted for a deposit. Claim fees are taken in
              BunkerCash up-front when a withdrawal claim is filed and sent to the admin wallet.
            </p>
            <p className="text-neutral-500">
              Both fee types are capped at 10%.
            </p>
          </div>
        </div>
      </div>

      {!loading && !state && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              The pool state could not be loaded. If this is a fresh deployment, initialize the pool first before setting fees.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
