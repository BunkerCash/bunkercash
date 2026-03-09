'use client'

import { useMemo, useState, useRef } from "react";
import type { Idl, Program } from '@coral-xyz/anchor'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { BN } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram, Transaction, type TransactionInstruction } from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import {
  getBunkercashMintPda,
  getClaimPriceSnapshotPda,
  getPoolPda,
  getPoolSignerPda,
  getProgram,
  PROGRAM_ID,
} from '@/lib/program'
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

interface PoolStateAccount {
  claimCounter: Stringable
}

interface WithdrawAccountApi {
  poolState: { fetch: (pubkey: PublicKey) => Promise<PoolStateAccount> }
}

interface RegisterSellMethods {
  registerSell: (amount: BN) => {
    accounts: (accounts: {
      pool: PublicKey
      poolSigner: PublicKey
      bunkercashMint: PublicKey
      claim: PublicKey
      claimPriceSnapshot: PublicKey
      user: PublicKey
      userBunkercash: PublicKey
      escrowBunkercashVault: PublicKey
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
  const { showToast } = useToast();
  const [activeView, setActiveView] = useState<'register' | 'history'>('register')
  const [amountUi, setAmountUi] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null)
  const [txSig, setTxSig] = useState<string | null>(null)
  const txInFlight = useRef(false);


  const program = useMemo(() => (wallet.publicKey ? getProgram(connection, wallet) : null), [connection, wallet])
  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), [])
  const mintPda = useMemo(() => getBunkercashMintPda(PROGRAM_ID), [])
  const poolSignerPda = useMemo(() => getPoolSignerPda(poolPda, PROGRAM_ID), [poolPda])

  const { balance: tokenBalanceUi, refreshBalance: fetchTokenBalance } =
    useTokenBalance();
  const { claims, refreshClaims: fetchClaims } = useMyClaims();

  const userBunkercashAta = useMemo(() => {
    if (!wallet.publicKey) return null
    return getAssociatedTokenAddressSync(
      mintPda,
      wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  }, [wallet.publicKey, mintPda])

  const escrowVaultAta = useMemo(
    () =>
      getAssociatedTokenAddressSync(
        mintPda,
        poolSignerPda,
        true,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ),
    [mintPda, poolSignerPda]
  )

  function uiToBaseUnits(uiAmount: string, decimals: number): BN {
    const s = uiAmount.trim()
    if (!s) throw new Error('empty amount')
    if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`invalid amount: "${uiAmount}"`)
    const [head, tailRaw = ''] = s.split('.')
    const tail = tailRaw.padEnd(decimals, '0').slice(0, decimals)
    const raw = `${head}${tail}`.replace(/^0+/, '') || '0'
    return new BN(raw)
  }

  const handleRegisterSell = async () => {
    if (!program || !wallet.publicKey || !connection || !userBunkercashAta)
      return;

    // Prevent duplicate submissions
    if (txInFlight.current) return;
    txInFlight.current = true;

    setError(null);
    setTxSig(null);
    setSubmitting(true);
    try {
      const sellAmount = uiToBaseUnits(amountUi, 9);
      if (sellAmount.lte(new BN(0))) throw new Error("Amount must be > 0");

      // Validate against actual balance
      if (parseFloat(amountUi) > parseFloat(tokenBalanceUi)) {
        setError("Amount exceeds your Banker Cash balance");
        showToast("Insufficient Banker Cash balance", "error");
        txInFlight.current = false;
        setSubmitting(false);
        return;
      }

      // Derive claim PDA from current counter.
      const accountApi = (program as Program<Idl>).account as WithdrawAccountApi
      const poolState = await accountApi.poolState.fetch(poolPda);
      const nextId = new BN(poolState.claimCounter.toString()).add(new BN(1));
      const idLe = Uint8Array.from(nextId.toArray("le", 8));
      const [claimPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("claim"), poolPda.toBuffer(), idLe],
        PROGRAM_ID,
      );
      const claimPriceSnapshotPda = getClaimPriceSnapshotPda(claimPda, PROGRAM_ID);

      // Ensure ATAs exist (idempotent).
      const createUserAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        wallet.publicKey,
        userBunkercashAta,
        wallet.publicKey,
        mintPda,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );

      const methodsApi = (program as Program<Idl>).methods as unknown as RegisterSellMethods
      const registerIx = await methodsApi
        .registerSell(sellAmount)
        .accounts({
          pool: poolPda,
          poolSigner: poolSignerPda,
          bunkercashMint: mintPda,
          claim: claimPda,
          claimPriceSnapshot: claimPriceSnapshotPda,
          user: wallet.publicKey,
          userBunkercash: userBunkercashAta,
          escrowBunkercashVault: escrowVaultAta,
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
      showToast(`Sell registered! Tx: ${sig.slice(0, 8)}…`, "success");
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
          Register Sell
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
              Irreversible escrow lock
            </p>
            <p className="text-xs text-neutral-500">
              Registering a sell transfers your Banker Cash into a program-owned
              escrow vault. No burn happens, but the lock is irreversible.
            </p>
          </div>

          <div className="bg-neutral-900 rounded-2xl p-6 border border-neutral-800">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs uppercase tracking-wider text-neutral-500">
                Amount
              </span>
              <span className="text-xs text-neutral-600">
                Balance: {tokenBalanceUi} Banker Cash
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
                  Banker Cash
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
              <span className="text-red-400 font-semibold">irreversible</span>.
              Registered tokens will be permanently locked in the escrow vault.
            </label>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
          {txSig && (
            <div className="rounded-xl border border-[#00FFB2]/30 bg-[#00FFB2]/10 px-4 py-3 text-sm text-[#00FFB2]">
              Registered. Tx: {txSig.slice(0, 8)}…{txSig.slice(-8)}
            </div>
          )}

          <button
            onClick={() => void handleRegisterSell()}
            disabled={
              submitting || !amountUi || parseFloat(amountUi) <= 0 || !confirmed
            }
            className="w-full bg-[#00FFB2] hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600 text-black font-semibold py-5 rounded-xl transition-all text-lg"
          >
            {submitting ? "Registering…" : "Register Sell"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {!wallet.publicKey ? (
            <div className="text-center py-12 text-neutral-600">
              Connect your wallet to view registrations
            </div>
          ) : claims.length === 0 ? (
            <div className="text-center py-12 text-neutral-600">
              No sell registrations yet
            </div>
          ) : (
            claims.map((c) => (
              <div
                key={c.pubkey.toBase58()}
                className="bg-neutral-900 rounded-xl p-5 border border-neutral-800"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-lg font-semibold">Claim #{c.id}</div>
                    <div className="text-sm text-neutral-500">
                      Locked: {Number(c.tokenAmountLocked) / 1e9} bRENT
                    </div>
                  </div>
                  <div
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      c.isClosed
                        ? "bg-[#00FFB2]/20 text-[#00FFB2]"
                        : "bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    {c.isClosed ? "closed" : "open"}
                  </div>
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-neutral-500">USDC paid</span>
                  <span className="text-neutral-300">
                    {Number(c.usdcPaid) / 1e6} USDC
                  </span>
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-neutral-500">Claim account</span>
                  <span className="text-neutral-500 font-mono">
                    {c.pubkey.toBase58().slice(0, 4)}…
                    {c.pubkey.toBase58().slice(-4)}
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
