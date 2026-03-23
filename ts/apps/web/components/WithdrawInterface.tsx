'use client'

import { useMemo, useState, useRef } from "react";
import type { Idl, Program } from '@coral-xyz/anchor'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
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
  getPoolPda,
  getProgram,
  type ProgramWallet,
  PROGRAM_ID,
} from '@/lib/program'
import { countFractionalDigits, parseUiAmountToBaseUnits } from '@/lib/amounts'
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useMyClaims } from "@/hooks/useMyClaims";
import { useToast } from "@/components/ui/ToastContext";

/** Detect wallet rejection errors */
function isWalletRejection(e: unknown): boolean {
  const msg =
    e instanceof Error
      ? e.message.toLowerCase()
      : String(e ?? "").toLowerCase();
  return (
    msg.includes("user rejected") ||
    msg.includes("user denied") ||
    msg.includes("rejected the request") ||
    msg.includes("transaction was not confirmed")
  );
}

interface Stringable {
  toString(): string
}

interface PoolAccount {
  claimCounter: Stringable
}

interface WithdrawAccountApi {
  pool: { fetch: (pubkey: PublicKey) => Promise<PoolAccount> }
}

interface FileClaimMethods {
  fileClaim: (amount: BN) => {
    accounts: (accounts: {
      pool: PublicKey
      claim: PublicKey
      user: PublicKey
      userBrent: PublicKey
      brentMint: PublicKey
      tokenProgram: PublicKey
      systemProgram: PublicKey
    }) => {
      instruction: () => Promise<TransactionInstruction>
    }
  }
}

export function WithdrawInterface() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const { publicKey, signTransaction, signAllTransactions } = wallet
  const { showToast } = useToast();
  const [activeView, setActiveView] = useState<'register' | 'history'>('register')
  const [amountUi, setAmountUi] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null)
  const [txSig, setTxSig] = useState<string | null>(null)
  const txInFlight = useRef(false);


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

  const { balance: tokenBalanceUi, refreshBalance: fetchTokenBalance } =
    useTokenBalance();
  const { claims, refreshClaims: fetchClaims } = useMyClaims();
  const amountRaw = useMemo(() => parseUiAmountToBaseUnits(amountUi, 6), [amountUi])
  const tokenBalanceRaw = useMemo(
    () => parseUiAmountToBaseUnits(tokenBalanceUi, 6),
    [tokenBalanceUi]
  )

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

  const inputError = useMemo(() => {
    if (!amountUi) return null
    if (countFractionalDigits(amountUi) > 6) return "Max 6 decimal places"
    if (amountRaw == null) return "Enter a valid amount"
    if (amountRaw <= 0n) return "Amount must be greater than 0"
    if (tokenBalanceRaw != null && amountRaw > tokenBalanceRaw) {
      return "Amount exceeds your bRENT balance"
    }
    return null
  }, [amountRaw, amountUi, tokenBalanceRaw])

  const displayError = error ?? inputError

  const handleRegisterSell = async () => {
    if (!program || !publicKey || !connection || !userBunkercashAta)
      return;

    // Prevent duplicate submissions
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

      // Validate against actual balance
      if (tokenBalanceRaw != null && amountRaw > tokenBalanceRaw) {
        setError("Amount exceeds your bRENT balance");
        showToast("Insufficient bRENT balance", "error");
        txInFlight.current = false;
        setSubmitting(false);
        return;
      }

      // Derive claim PDA from current counter.
      const accountApi = (program as Program<Idl>).account as WithdrawAccountApi
      const poolState = await accountApi.pool.fetch(poolPda);
      const nextId = new BN(poolState.claimCounter.toString());
      const idLe = Uint8Array.from(nextId.toArray("le", 8));
      const [claimPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("claim"), publicKey.toBuffer(), idLe],
        PROGRAM_ID,
      );

      // Ensure ATAs exist (idempotent).
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
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction().add(createUserAtaIx, registerIx);
      const sig = await (
        program.provider as { sendAndConfirm: (tx: Transaction) => Promise<string> }
      ).sendAndConfirm(tx);
      setTxSig(sig);
      setAmountUi("");
      setConfirmed(false);
      await fetchTokenBalance();
      await fetchClaims();
      showToast(`Request submitted. Tx: ${sig.slice(0, 8)}…`, "success");
      // Invalidate transactions cache so Transactions tab fetches fresh data
      const { invalidateTransactionCache } =
        await import("@/hooks/useMyTransactions");
      invalidateTransactionCache();
      setActiveView("history");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? "");
      if (isWalletRejection(e)) {
        setError("Transaction was rejected in your wallet.");
        showToast("Transaction rejected by wallet", "warning");
      } else if (e instanceof SendTransactionError) {
        const logs = await e.getLogs(connection);
        if (logs?.length) {
          console.error('File claim transaction logs:', logs);
        }
        setError(e.message || "Transaction failed");
        showToast(e.message || "Transaction failed", "error");
      } else if (msg.includes("ClaimAmountTooSmall") || msg.includes("non-zero USDC value")) {
        setError("Amount is too small to produce any USDC at the current NAV.");
        showToast("Claim amount too small at current NAV", "warning");
      } else if (msg.includes("already in use") || msg.includes("0x0")) {
        setError("Claim slot conflict — another transaction landed first. Please try again.");
        showToast("Claim slot taken, please retry", "warning");
      } else {
        setError(msg || "Transaction failed");
        showToast(msg || "Transaction failed", "error");
      }
    } finally {
      setSubmitting(false);
      txInFlight.current = false;
    }
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
          Submit Request
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
              Irreversible action
            </p>
            <p className="text-xs text-neutral-500">
              Submitting a request removes the selected token amount from
              circulation and creates a pending settlement request, subject to
              available protocol liquidity.
            </p>
          </div>

          <div className="bg-neutral-900 rounded-2xl p-6 border border-neutral-800">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs uppercase tracking-wider text-neutral-500">
                Amount
              </span>
              <span className="text-xs text-neutral-600">
                Balance: {tokenBalanceUi} bRENT
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
              and that settlement is not guaranteed in timing or amount beyond
              available protocol liquidity.
            </label>
          </div>

          {displayError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {displayError}
            </div>
          )}
          {txSig && (
            <div className="rounded-xl border border-[#00FFB2]/30 bg-[#00FFB2]/10 px-4 py-3 text-sm text-[#00FFB2]">
              Request submitted. Tx: {txSig.slice(0, 8)}…{txSig.slice(-8)}
            </div>
          )}

          <button
            onClick={() => void handleRegisterSell()}
            disabled={
              submitting || !amountRaw || amountRaw <= 0n || !confirmed || !!inputError
            }
            className="w-full bg-[#00FFB2] hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600 text-black font-semibold py-5 rounded-xl transition-all text-lg"
          >
            {submitting ? "Submitting…" : "Submit Request"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {!publicKey ? (
            <div className="text-center py-12 text-neutral-600">
              Connect your wallet to view requests
            </div>
          ) : claims.length === 0 ? (
            <div className="text-center py-12 text-neutral-600">
              No requests yet
            </div>
          ) : (
            claims.map((c) => (
              <div key={c.pubkey} className="bg-neutral-900 rounded-xl p-5 border border-neutral-800">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-lg font-semibold">Request #{c.id}</div>
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
                  <span className="text-neutral-500">Requested Amount</span>
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
                  <span className="text-neutral-500">Request Account</span>
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
    </div>
  );
}
