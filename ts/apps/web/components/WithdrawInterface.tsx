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
  masterWallet: PublicKey
  nav: Stringable
  totalBunkercashSupply: Stringable
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
      userBunkercash: PublicKey
      poolBunkercashEscrow: PublicKey
      masterWallet: PublicKey
      masterBunkercash: PublicKey
      bunkercashMint: PublicKey
      feeConfig: PublicKey
      tokenProgram: PublicKey
      associatedTokenProgram: PublicKey
      systemProgram: PublicKey
    }) => {
      instruction: () => Promise<TransactionInstruction>
    }
  }
}

interface CancelClaimMethods {
  cancelClaim: () => {
    accounts: (accounts: {
      pool: PublicKey
      claim: PublicKey
      user: PublicKey
      userBunkercash: PublicKey
      poolBunkercashEscrow: PublicKey
      bunkercashMint: PublicKey
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
  const [cancellingPubkey, setCancellingPubkey] = useState<string | null>(null)
  const txInFlight = useRef(false);
  const [poolState, setPoolState] = useState<{
    masterWallet: PublicKey
    nav: bigint
    totalBunkercashSupply: bigint
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
  const poolBunkercashEscrow = useMemo(
    () => getAssociatedTokenAddressSync(mintPda, poolPda, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
    [mintPda, poolPda]
  )

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
        masterWallet: state.masterWallet,
        nav: availableNav,
        totalBunkercashSupply: BigInt(state.totalBunkercashSupply.toString()),
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

  const feeBunkercashRaw = useMemo(() => {
    if (!poolState || amountRaw == null || amountRaw <= 0n) return null
    return (amountRaw * BigInt(poolState.claimFeeBps)) / 10_000n
  }, [amountRaw, poolState])

  const netBunkercashRaw = useMemo(() => {
    if (amountRaw == null || feeBunkercashRaw == null) return null
    if (amountRaw <= feeBunkercashRaw) return 0n
    return amountRaw - feeBunkercashRaw
  }, [amountRaw, feeBunkercashRaw])

  const estimatedUsdcRaw = useMemo(() => {
    if (!poolState || netBunkercashRaw == null) return null
    if (netBunkercashRaw <= 0n || poolState.nav <= 0n || poolState.totalBunkercashSupply <= 0n) return null
    return (netBunkercashRaw * poolState.nav) / poolState.totalBunkercashSupply
  }, [netBunkercashRaw, poolState])

  const inputError = useMemo(() => {
    if (!amountUi) return null
    if (countFractionalDigits(amountUi) > 6) return "Max 6 decimal places"
    if (amountRaw == null) return "Enter a valid amount"
    if (amountRaw <= 0n) return "Amount must be greater than 0"
    if (netBunkercashRaw != null && netBunkercashRaw <= 0n) {
      return "Amount is too small after fee"
    }
    if (estimatedUsdcRaw !== null && estimatedUsdcRaw <= 0n) {
      return "Amount is too small to produce any USDC at the current reference value"
    }
    if (tokenBalanceRaw != null && amountRaw > tokenBalanceRaw) {
      return "Amount exceeds your BunkerCash balance"
    }
    return null
  }, [amountRaw, amountUi, estimatedUsdcRaw, netBunkercashRaw, tokenBalanceRaw])

  const displayError = error ?? inputError

  const submitDisabled =
    submitting || !amountRaw || amountRaw <= 0n || !confirmed || !!inputError;

  const handleRegisterSell = async () => {
    if (!wallet || !program || !publicKey || !connection || !userBunkercashAta || !poolState)
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
        setError("Amount exceeds your BunkerCash balance");
        showToast("Insufficient BunkerCash balance", "error");
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

      const masterWallet = livePoolState.masterWallet
      const masterBunkercash = getAssociatedTokenAddressSync(
        mintPda,
        masterWallet,
        true,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      )

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
          userBunkercash: userBunkercashAta,
          poolBunkercashEscrow,
          masterWallet,
          masterBunkercash,
          bunkercashMint: mintPda,
          feeConfig: feeConfigPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
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
      showToast(`Sell request submitted. Tx: ${sig.slice(0, 8)}…`, "success");
      const { invalidateTransactionCache } =
        await import("@/hooks/useMyTransactions");
      invalidateTransactionCache();
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
        const { invalidateTransactionCache } =
          await import("@/hooks/useMyTransactions");
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

  const handleCancelClaim = useCallback(
    async (claimPubkey: string) => {
      if (!wallet || !program || !publicKey || !connection || !userBunkercashAta) return
      if (cancellingPubkey) return

      setCancellingPubkey(claimPubkey)
      setError(null)
      try {
        const claimPda = new PublicKey(claimPubkey)
        const methodsApi = (program as Program<Idl>).methods as unknown as CancelClaimMethods
        const ix = await methodsApi
          .cancelClaim()
          .accounts({
            pool: poolPda,
            claim: claimPda,
            user: publicKey,
            userBunkercash: userBunkercashAta,
            poolBunkercashEscrow,
            bunkercashMint: mintPda,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .instruction()

        const tx = new Transaction().add(ix)
        const sig = await sendAndConfirmWalletTransaction({
          connection,
          wallet,
          transaction: tx,
        })
        showToast(`Sell request cancelled. Tx: ${sig.slice(0, 8)}…`, "success")
        await fetchTokenBalance()
        await fetchClaims()
        await fetchPoolState()
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e ?? "")
        if (isWalletRejection(e)) {
          showToast("Transaction rejected by wallet", "warning")
        } else if (e instanceof SendTransactionError) {
          const logs = await e.getLogs(connection)
          if (logs?.length) console.error('Cancel claim logs:', logs)
          showToast(e.message || "Cancel failed", "error")
        } else {
          showToast(msg || "Cancel failed", "error")
        }
      } finally {
        setCancellingPubkey(null)
      }
    },
    [
      cancellingPubkey,
      connection,
      fetchClaims,
      fetchPoolState,
      fetchTokenBalance,
      mintPda,
      poolBunkercashEscrow,
      poolPda,
      program,
      publicKey,
      showToast,
      userBunkercashAta,
      wallet,
    ]
  )

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
    <div className="space-y-8">
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
        <div className="space-y-6">
          <div className="bg-neutral-900/50 rounded-xl p-4 border border-neutral-800">
            <p className="text-sm text-neutral-300 font-semibold mb-1">
              Sell request
            </p>
            <p className="text-xs text-neutral-500">
              A fee is taken in BunkerCash up-front; the remainder is locked in
              escrow until settled. You can cancel anytime before full settlement
              to recover whatever BunkerCash is still in escrow.
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              Current claim fee: {formatPercentFromBps(poolState?.claimFeeBps ?? 0)}%
            </p>
          </div>

          <div className="bg-neutral-900 rounded-2xl p-6 border border-neutral-800">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs uppercase tracking-wider text-neutral-500">
                Amount
              </span>
              <span className="text-xs text-neutral-600">
                Balance: {tokenBalanceUi} BunkerCash
              </span>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="text"
                value={amountUi}
                onChange={(e) => setAmountUi(e.target.value)}
                placeholder="0.00"
                className="bg-transparent text-3xl font-bold flex-1 outline-none placeholder:text-neutral-800"
              />
              <div className="flex items-center gap-2 bg-[#00FFB2]/10 border-2 border-[#00FFB2] px-5 py-3 rounded-xl">
                <span className="font-semibold text-sm text-[#00FFB2]">
                  BunkerCash
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

          {amountRaw != null && amountRaw > 0n && feeBunkercashRaw != null && netBunkercashRaw != null && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 text-sm text-neutral-300">
              <div className="flex justify-between">
                <span>You send</span>
                <span>{toUi(amountRaw, 6)} BunkerCash</span>
              </div>
              <div className="mt-2 flex justify-between text-neutral-400">
                <span>Fee</span>
                <span>
                  {toUi(feeBunkercashRaw, 6)} BunkerCash ({formatPercentFromBps(poolState?.claimFeeBps ?? 0)}%)
                </span>
              </div>
              <div className="mt-2 flex justify-between font-medium text-white">
                <span>Locked in escrow</span>
                <span>{toUi(netBunkercashRaw, 6)} BunkerCash</span>
              </div>
              {estimatedUsdcRaw != null && (
                <div className="mt-2 flex justify-between text-neutral-400">
                  <span>USDC on full settlement</span>
                  <span>≈ {toUi(estimatedUsdcRaw, 6)} USDC</span>
                </div>
              )}
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
              I understand the fee is charged up-front in BunkerCash and that
              settlement timing and amount depend on available protocol
              liquidity. I can cancel before full settlement to recover any
              BunkerCash still in escrow.
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
            className="w-full bg-[#00FFB2] hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600 text-black font-semibold py-5 rounded-xl transition-all text-lg"
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
            claims.map((c) => {
              const isCancelling = cancellingPubkey === c.pubkey
              const escrowRemaining = BigInt(c.bunkercashRemaining ?? "0")
              const canCancel = !c.processed && !c.cancelled && escrowRemaining > 0n
              const statusBadge = c.cancelled
                ? { label: "cancelled", className: "bg-red-500/15 text-red-300" }
                : c.processed
                  ? { label: "settled", className: "bg-[#00FFB2]/20 text-[#00FFB2]" }
                  : Number(c.paidUsdc) > 0
                    ? { label: "partially settled", className: "bg-sky-500/15 text-sky-300" }
                    : { label: "pending", className: "bg-neutral-800 text-neutral-400" }
              return (
                <div key={c.pubkey} className="bg-neutral-900 rounded-xl p-5 border border-neutral-800">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="text-lg font-semibold">Sell Request #{c.id}</div>
                    </div>
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-medium ${statusBadge.className}`}
                    >
                      {statusBadge.label}
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
                  {!c.processed && !c.cancelled && (
                    <div className="mt-1 flex justify-between text-sm">
                      <span className="text-neutral-500">Remaining Amount</span>
                      <span className="text-neutral-300">
                        {Number(c.remainingUsdc) / 1e6} USDC
                      </span>
                    </div>
                  )}
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-neutral-500">BunkerCash in escrow</span>
                    <span className="text-neutral-300">
                      {Number(c.bunkercashRemaining ?? "0") / 1e6} / {Number(c.bunkercashEscrow ?? "0") / 1e6}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-neutral-500">Sell Request Account</span>
                    <span className="text-neutral-500 font-mono">
                      {c.pubkey.slice(0, 4)}…
                      {c.pubkey.slice(-4)}
                    </span>
                  </div>
                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => void handleCancelClaim(c.pubkey)}
                      disabled={isCancelling}
                      className="mt-4 w-full rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isCancelling ? "Cancelling…" : "Cancel sell request"}
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      <Dialog
        open={confirmationStep === "warning"}
        onOpenChange={handleCloseConfirmation}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm sell request</DialogTitle>
            <DialogDescription>
              The fee is deducted in BunkerCash up-front and sent to the
              protocol. The remaining BunkerCash is locked in escrow until
              settlement. You can cancel anytime before full settlement to
              recover whatever is still in escrow.
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
            <DialogTitle>Submit sell request</DialogTitle>
            <DialogDescription>
              You are about to submit a sell request. The fee will be deducted
              in BunkerCash and the remainder locked in escrow. Settlement
              amount and timing depend on protocol liquidity.
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
              className="rounded-xl bg-[#00FFB2] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#00FFB2]/90"
            >
              Confirm Sell
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
