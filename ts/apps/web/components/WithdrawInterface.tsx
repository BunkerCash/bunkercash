'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Idl, Program } from '@coral-xyz/anchor'
import { useConnection } from '@solana/wallet-adapter-react'
import { BN } from '@coral-xyz/anchor'
import { PublicKey, SendTransactionError, SystemProgram, Transaction, type TransactionInstruction } from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import {
  getBunkercashMintPda,
  getFeeConfigPda,
  getPoolPda,
  getProgram,
  type ProgramWallet,
  PROGRAM_ID,
} from '@/lib/program'
import { countFractionalDigits, parseUiAmountToBaseUnits } from '@/lib/amounts'
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useMyClaims } from "@/hooks/useMyClaims";
import { invalidateTransactionCache } from "@/hooks/useMyTransactions";
import { useToast } from "@/components/ui/ToastContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sendAndConfirmWalletTransaction } from "@/lib/sendAndConfirmWalletTransaction";
import { useOptionalWallet } from "@/hooks/useOptionalWallet";

function isWalletRejection(e: unknown): boolean {
  const msg =
    e instanceof Error
      ? e.message.toLowerCase()
      : String(e ?? "").toLowerCase();
  return (
    msg.includes("user rejected") ||
    msg.includes("user denied") ||
    msg.includes("rejected the request")
  );
}

interface Stringable {
  toString(): string
}

interface PoolAccount {
  nav: Stringable
  totalBrentSupply: Stringable
  totalPendingClaims: Stringable
  claimCounter: Stringable
}

interface FeeConfigAccount {
  claimFeeBps: Stringable
}

interface WithdrawAccountApi {
  pool: { fetch: (pubkey: PublicKey) => Promise<PoolAccount> }
  feeConfig?: { fetch: (pubkey: PublicKey) => Promise<FeeConfigAccount> }
}

interface FileClaimMethods {
  fileClaim: (amount: BN) => {
    accounts: (accounts: {
      pool: PublicKey
      claim: PublicKey
      user: PublicKey
      userBrent: PublicKey
      brentMint: PublicKey
      feeConfig: PublicKey
      tokenProgram: PublicKey
      systemProgram: PublicKey
    }) => {
      instruction: () => Promise<TransactionInstruction>
    }
  }
}

function toUi(amount: bigint, decimals: number): string {
  const s = amount.toString().padStart(decimals + 1, "0")
  const head = s.slice(0, -decimals)
  const tail = s.slice(-decimals).replace(/0+$/, "")
  return tail.length ? `${head}.${tail}` : head
}

function formatPercentFromBps(bps: number): string {
  const formatted = (bps / 100).toFixed(2)
  return formatted.replace(/\.?0+$/, "")
}

export function WithdrawInterface() {
  const { connection } = useConnection()
  const wallet = useOptionalWallet()
  const publicKey = wallet?.publicKey ?? null
  const signTransaction = wallet?.signTransaction
  const signAllTransactions = wallet?.signAllTransactions
  const { showToast } = useToast();
  const [activeView, setActiveView] = useState<'register' | 'history'>('register')
  const [amountUi, setAmountUi] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState(false);
  const [confirmationStep, setConfirmationStep] = useState<"idle" | "warning" | "final">("idle");
  const [error, setError] = useState<string | null>(null)
  const [txSig, setTxSig] = useState<string | null>(null)
  const txInFlight = useRef(false);
  const [poolState, setPoolState] = useState<{
    nav: bigint
    totalBrentSupply: bigint
    claimCounter: bigint
    claimFeeBps: number
  } | null>(null)

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
  )
  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), [])
  const mintPda = useMemo(() => getBunkercashMintPda(PROGRAM_ID), [])
  const feeConfigPda = useMemo(() => getFeeConfigPda(PROGRAM_ID), [])

  const { balance: tokenBalanceUi, refreshBalance: fetchTokenBalance } =
    useTokenBalance();
  const { claims, refreshClaims: fetchClaims } = useMyClaims();
  const amountRaw = useMemo(() => parseUiAmountToBaseUnits(amountUi, 6), [amountUi])
  const tokenBalanceRaw = useMemo(
    () => parseUiAmountToBaseUnits(tokenBalanceUi, 6),
    [tokenBalanceUi]
  )

  const fetchPoolState = useCallback(async () => {
    if (!program) return

    try {
      const accountApi = (program as Program<Idl>).account as WithdrawAccountApi
      const state = await accountApi.pool.fetch(poolPda)
      let claimFeeBps = 0

      if (accountApi.feeConfig) {
        try {
          const feeConfig = await accountApi.feeConfig.fetch(feeConfigPda)
          claimFeeBps = Number(feeConfig.claimFeeBps.toString())
        } catch {
          claimFeeBps = 0
        }
      }

      const nav = BigInt(state.nav.toString())
      const totalPendingClaims = BigInt(state.totalPendingClaims.toString())
      const availableNav = nav > totalPendingClaims ? nav - totalPendingClaims : 0n

      setPoolState({
        nav: availableNav,
        totalBrentSupply: BigInt(state.totalBrentSupply.toString()),
        claimCounter: BigInt(state.claimCounter.toString()),
        claimFeeBps,
      })
    } catch {
      setPoolState(null)
    }
  }, [feeConfigPda, poolPda, program])

  useEffect(() => {
    void fetchPoolState()
  }, [fetchPoolState])

  const userBunkercashAta = useMemo(() => {
    if (!publicKey) return null
    return getAssociatedTokenAddressSync(
      mintPda,
      publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  }, [publicKey, mintPda])

  const grossClaimUsdcRaw = useMemo(() => {
    if (!poolState || amountRaw == null) return null
    if (amountRaw <= 0n || poolState.nav <= 0n || poolState.totalBrentSupply <= 0n) return null
    return (amountRaw * poolState.nav) / poolState.totalBrentSupply
  }, [amountRaw, poolState])

  const claimFeeRaw = useMemo(() => {
    if (!poolState || grossClaimUsdcRaw == null) return null
    return (grossClaimUsdcRaw * BigInt(poolState.claimFeeBps)) / 10_000n
  }, [grossClaimUsdcRaw, poolState])

  const netClaimUsdcRaw = useMemo(() => {
    if (grossClaimUsdcRaw == null || claimFeeRaw == null) return null
    return grossClaimUsdcRaw - claimFeeRaw
  }, [claimFeeRaw, grossClaimUsdcRaw])

  const inputError = useMemo(() => {
    if (!amountUi) return null
    if (countFractionalDigits(amountUi) > 6) return "Max 6 decimal places"
    if (amountRaw == null) return "Enter a valid amount"
    if (amountRaw <= 0n) return "Amount must be greater than 0"
    if (grossClaimUsdcRaw !== null && grossClaimUsdcRaw <= 0n) {
      return "Amount is too small to produce any USDC at the current reference value"
    }
    if (tokenBalanceRaw != null && amountRaw > tokenBalanceRaw) {
      return "Amount exceeds your bRENT balance"
    }
    return null
  }, [amountRaw, amountUi, grossClaimUsdcRaw, tokenBalanceRaw])

  const displayError = error ?? inputError

  const submitDisabled =
    submitting || !amountRaw || amountRaw <= 0n || !confirmed || !!inputError;

  const handleRegisterSell = async () => {
    if (!wallet || !program || !publicKey || !connection || !userBunkercashAta)
      return;

    if (txInFlight.current) return;
    txInFlight.current = true;

    setError(null);
    setTxSig(null);
    setSubmitting(true);
    try {
      if (inputError || amountRaw == null || amountRaw <= 0n) {
        throw new Error(inputError ?? "Amount must be greater than 0")
      }

      const sellAmount = new BN(amountRaw.toString())

      if (tokenBalanceRaw != null && amountRaw > tokenBalanceRaw) {
        setError("Amount exceeds your bRENT balance");
        showToast("Insufficient bRENT balance", "error");
        txInFlight.current = false;
        setSubmitting(false);
        return;
      }

      const accountApi = (program as Program<Idl>).account as WithdrawAccountApi
      // Always read the latest on-chain counter before deriving the claim PDA.
      // A cached counter can drift after a prior sell request and trigger Anchor's
      // `ConstraintSeeds` check on the `claim` account.
      const livePoolState = await accountApi.pool.fetch(poolPda)
      const claimId = new BN(livePoolState.claimCounter.toString());
      const idLe = Uint8Array.from(claimId.toArray("le", 8));
      const [claimPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("claim"), publicKey.toBuffer(), idLe],
        PROGRAM_ID,
      );

      const createUserAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        publicKey,
        userBunkercashAta,
        publicKey,
        mintPda,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );

      const methodsApi = (program as Program<Idl>).methods as unknown as FileClaimMethods
      const registerIx = await methodsApi
        .fileClaim(sellAmount)
        .accounts({
          pool: poolPda,
          claim: claimPda,
          user: publicKey,
          userBrent: userBunkercashAta,
          brentMint: mintPda,
          feeConfig: feeConfigPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction().add(createUserAtaIx, registerIx);
      const sig = await sendAndConfirmWalletTransaction({
        connection,
        wallet,
        transaction: tx,
      });
      setTxSig(sig);
      setAmountUi("");
      setConfirmed(false);
      setConfirmationStep("idle");
      await fetchTokenBalance();
      await fetchClaims();
      await fetchPoolState();
      invalidateTransactionCache();
      showToast(`Sell request submitted. Tx: ${sig.slice(0, 8)}…`, "success");
      setActiveView("history");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? "");
      if (isWalletRejection(e)) {
        setError("Transaction was rejected in your wallet.");
        showToast("Transaction rejected by wallet", "warning");
      } else if (msg.includes("already been processed")) {
        setError(null);
        setTxSig(null);
        await fetchTokenBalance();
        await fetchClaims();
        invalidateTransactionCache();
        setActiveView("history");
        showToast("Sell request was already processed. Check History.", "success");
      } else if (e instanceof SendTransactionError) {
        const logs = await e.getLogs(connection);
        if (logs?.length) {
          console.error('File claim transaction logs:', logs);
        }
        setError(e.message || "Transaction failed");
        showToast(e.message || "Transaction failed", "error");
      } else if (msg.includes("ConstraintSeeds")) {
        setError("Sell request counter changed before submission. Please retry.");
        showToast("Sell request counter changed, please retry", "warning");
        await fetchPoolState();
      } else if (msg.includes("ClaimAmountTooSmall") || msg.includes("non-zero USDC value")) {
        setError("Amount is too small to produce any USDC at the current reference value.");
        showToast("Sell amount too small at current reference value", "warning");
      } else if (msg.includes("already in use") || msg.includes("0x0")) {
        setError("Sell request slot conflict — another transaction landed first. Please try again.");
        showToast("Sell request slot taken, please retry", "warning");
      } else {
        setError(msg || "Transaction failed");
        showToast(msg || "Transaction failed", "error");
      }
    } finally {
      setSubmitting(false);
      txInFlight.current = false;
    }
  };

  const handleOpenConfirmation = () => {
    if (submitDisabled) return;
    setConfirmationStep("warning");
  };

  const handleCloseConfirmation = (open: boolean) => {
    if (!open && !submitting) {
      setConfirmationStep("idle");
    }
  };

  const handleFinalConfirmation = () => {
    setConfirmationStep("idle");
    void handleRegisterSell();
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex gap-2 bg-neutral-900 p-1 rounded-xl">
        <button
          onClick={() => setActiveView("register")}
          className={`flex-1 px-4 py-3 text-sm rounded-lg transition-all ${
            activeView === "register"
              ? "bg-[#00FFB2] text-black font-semibold"
              : "text-neutral-500 hover:text-white"
          }`}
        >
          Sell
        </button>
        <button
          onClick={() => setActiveView("history")}
          className={`flex-1 px-4 py-3 text-sm rounded-lg transition-all ${
            activeView === "history"
              ? "bg-[#00FFB2] text-black font-semibold"
              : "text-neutral-500 hover:text-white"
          }`}
        >
          History
        </button>
      </div>

      {activeView === "register" ? (
        <div className="space-y-5 sm:space-y-6">
          <div className="bg-neutral-900/50 rounded-xl p-4 border border-neutral-800">
            <p className="text-sm text-neutral-300 font-semibold mb-1">
              Irreversible action
            </p>
            <p className="text-xs text-neutral-500">
              Selling removes the selected token amount from circulation and
              creates a pending settlement request, subject to available
              protocol liquidity.
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              Current claim fee: {formatPercentFromBps(poolState?.claimFeeBps ?? 0)}%
            </p>
          </div>

          <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-4 sm:p-6">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs uppercase tracking-wider text-neutral-500">
                Amount
              </span>
              <span className="text-xs text-neutral-600">
                Balance: {tokenBalanceUi} bRENT
              </span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <input
                type="text"
                value={amountUi}
                onChange={(e) => setAmountUi(e.target.value)}
                placeholder="0.00"
                className="min-w-0 flex-1 bg-transparent text-2xl font-bold outline-none placeholder:text-neutral-800 sm:text-3xl"
              />
              <div className="inline-flex w-fit items-center gap-2 self-start rounded-xl border-2 border-[#00FFB2] bg-[#00FFB2]/10 px-4 py-2.5 sm:self-auto sm:px-5 sm:py-3">
                <span className="font-semibold text-sm text-[#00FFB2]">
                  bRENT
                </span>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setAmountUi(tokenBalanceUi)}
                className="text-xs text-[#00FFB2] hover:underline"
              >
                MAX
              </button>
            </div>
          </div>

          {grossClaimUsdcRaw != null && claimFeeRaw != null && netClaimUsdcRaw != null && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 text-sm text-neutral-300">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span>Gross sell value</span>
                <span>{toUi(grossClaimUsdcRaw, 6)} USDC</span>
              </div>
              <div className="mt-2 flex flex-col gap-1 text-neutral-400 sm:flex-row sm:items-center sm:justify-between">
                <span>Claim fee</span>
                <span>
                  {toUi(claimFeeRaw, 6)} USDC ({formatPercentFromBps(poolState?.claimFeeBps ?? 0)}%)
                </span>
              </div>
              <div className="mt-2 flex flex-col gap-1 font-medium text-white sm:flex-row sm:items-center sm:justify-between">
                <span>Estimated net settlement</span>
                <span>{toUi(netClaimUsdcRaw, 6)} USDC</span>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3 px-1">
            <input
              type="checkbox"
              id="confirm-sell"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-800 text-[#00FFB2] focus:ring-[#00FFB2]"
            />
            <label
              htmlFor="confirm-sell"
              className="text-sm text-neutral-400 cursor-pointer select-none"
            >
              I understand that this action is{" "}
              <span className="text-red-400 font-semibold">irreversible</span>{" "}
              because the tokens are burned immediately, and settlement is not
              guaranteed in timing or amount beyond available protocol
              liquidity.
            </label>
          </div>

          {displayError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {displayError}
            </div>
          )}
          {txSig && (
            <div className="rounded-xl border border-[#00FFB2]/30 bg-[#00FFB2]/10 px-4 py-3 text-sm text-[#00FFB2]">
              Sell request submitted. Tx: {txSig.slice(0, 8)}…{txSig.slice(-8)}
            </div>
          )}

          <button
            onClick={handleOpenConfirmation}
            disabled={submitDisabled}
            className="w-full rounded-xl bg-[#00FFB2] py-4 text-base font-semibold text-black transition-all hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600 sm:py-5 sm:text-lg"
          >
            {submitting ? "Submitting…" : "Sell"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {!publicKey ? (
            <div className="text-center py-12 text-neutral-600">
              Connect your wallet to view sell requests
            </div>
          ) : claims.length === 0 ? (
            <div className="text-center py-12 text-neutral-600">
              No sell requests yet
            </div>
          ) : (
            claims.map((c) => (
              <div key={c.pubkey} className="bg-neutral-900 rounded-xl p-5 border border-neutral-800">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-lg font-semibold">Sell Request #{c.id}</div>
                  </div>
                  <div
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      c.processed
                        ? "bg-[#00FFB2]/20 text-[#00FFB2]"
                        : Number(c.paidUsdc) > 0
                          ? "bg-sky-500/15 text-sky-300"
                          : "bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    {c.processed ? "settled" : Number(c.paidUsdc) > 0 ? "partially settled" : "pending"}
                  </div>
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-neutral-500">Requested Settlement</span>
                  <span className="text-neutral-300">
                    {Number(c.requestedUsdc) / 1e6} USDC
                  </span>
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-neutral-500">Settled Amount</span>
                  <span className="text-neutral-300">
                    {Number(c.paidUsdc) / 1e6} USDC
                  </span>
                </div>
                {!c.processed && (
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-neutral-500">Remaining Amount</span>
                    <span className="text-neutral-300">
                      {Number(c.remainingUsdc) / 1e6} USDC
                    </span>
                  </div>
                )}
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-neutral-500">Sell Request Account</span>
                  <span className="text-neutral-500 font-mono">
                    {c.pubkey.slice(0, 4)}…
                    {c.pubkey.slice(-4)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <Dialog
        open={confirmationStep === "warning"}
        onOpenChange={handleCloseConfirmation}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogDescription>
              This sell request cannot be canceled. The selected tokens will be
              burned as part of the request, and settlement depends on available
              protocol liquidity.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmationStep("idle")}
              className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setConfirmationStep("final")}
              className="rounded-xl bg-[#00FFB2] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#00FFB2]/90"
            >
              Continue
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmationStep === "final"}
        onOpenChange={handleCloseConfirmation}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you really sure?</DialogTitle>
            <DialogDescription>
              You are about to submit an irreversible sell request. Once the
              wallet transaction is approved, the tokens are burned and the sell
              request moves into settlement processing.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmationStep("idle")}
              className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
            >
              Go Back
            </button>
            <button
              type="button"
              onClick={handleFinalConfirmation}
              className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500/90"
            >
              Confirm Sell
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
