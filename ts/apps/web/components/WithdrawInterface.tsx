'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { BN } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { getBunkercashMintPda, getPoolPda, getPoolSignerPda, getProgram, PROGRAM_ID } from '@/lib/program'

export function WithdrawInterface() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const [activeView, setActiveView] = useState<'register' | 'history'>('register')
  const [amountUi, setAmountUi] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txSig, setTxSig] = useState<string | null>(null)
  const [tokenBalanceUi, setTokenBalanceUi] = useState<string>('0')
  const [claims, setClaims] = useState<
    Array<{
      pubkey: PublicKey
      id: string
      tokenAmountLocked: string
      usdcPaid: string
      isClosed: boolean
      createdAt: string
    }>
  >([])

  const program = useMemo(() => (wallet.publicKey ? getProgram(connection, wallet) : null), [connection, wallet])
  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), [])
  const mintPda = useMemo(() => getBunkercashMintPda(PROGRAM_ID), [])
  const poolSignerPda = useMemo(() => getPoolSignerPda(poolPda, PROGRAM_ID), [poolPda])

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

  const fetchTokenBalance = useCallback(async () => {
    if (!connection || !userBunkercashAta) return
    try {
      const bal = await connection.getTokenAccountBalance(userBunkercashAta, 'confirmed')
      setTokenBalanceUi(bal.value.uiAmountString ?? '0')
    } catch {
      setTokenBalanceUi('0')
    }
  }, [connection, userBunkercashAta])

  const fetchClaims = useCallback(async () => {
    if (!program || !wallet.publicKey) return
    // ClaimState: fetch all and filter by user (memcmp on pubkey varies by RPC)
    const all = await (program.account as any).claimState.all()
    const mine = all.filter(
      (x: any) => (x.account.user as PublicKey)?.toBase58?.() === wallet.publicKey.toBase58()
    )
    const normalized = mine
      .map((x: any) => ({
        pubkey: x.publicKey as PublicKey,
        id: x.account.id?.toString?.() ?? String(x.account.id),
        tokenAmountLocked: x.account.tokenAmountLocked?.toString?.() ?? String(x.account.tokenAmountLocked),
        usdcPaid: x.account.usdcPaid?.toString?.() ?? String(x.account.usdcPaid),
        isClosed: Boolean(x.account.isClosed),
        createdAt: x.account.createdAt?.toString?.() ?? String(x.account.createdAt),
      }))
      .sort((a: any, b: any) => Number(b.id) - Number(a.id))
    setClaims(normalized)
  }, [program, wallet.publicKey])

  useEffect(() => {
    void fetchTokenBalance()
    void fetchClaims()
  }, [fetchTokenBalance, fetchClaims])

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
    if (!program || !wallet.publicKey || !connection || !userBunkercashAta) return
    setError(null)
    setTxSig(null)
    setSubmitting(true)
    try {
      const sellAmount = uiToBaseUnits(amountUi, 9)
      if (sellAmount.lte(new BN(0))) throw new Error('Amount must be > 0')

      // Derive claim PDA from current counter.
      const poolState = await (program.account as any).poolState.fetch(poolPda)
      const nextId = new BN(poolState.claimCounter as any).add(new BN(1))
      const idLe = Uint8Array.from(nextId.toArray('le', 8))
      const [claimPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('claim'), poolPda.toBuffer(), idLe],
        PROGRAM_ID
      )

      // Ensure ATAs exist (idempotent).
      const createUserAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        wallet.publicKey,
        userBunkercashAta,
        wallet.publicKey,
        mintPda,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
      const createEscrowAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        wallet.publicKey,
        escrowVaultAta,
        poolSignerPda,
        mintPda,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )

      const registerIx = await (program.methods as any)
        .registerSell(sellAmount)
        .accounts({
          pool: poolPda,
          poolSigner: poolSignerPda,
          bunkercashMint: mintPda,
          claim: claimPda,
          user: wallet.publicKey,
          userBunkercash: userBunkercashAta,
          escrowBunkercashVault: escrowVaultAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction()

      const tx = new Transaction().add(createUserAtaIx, createEscrowAtaIx, registerIx)
      const sig = await (program.provider as any).sendAndConfirm(tx)
      setTxSig(sig)
      setAmountUi('')
      await fetchTokenBalance()
      await fetchClaims()
      setActiveView('history')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transaction failed')
    } finally {
      setSubmitting(false)
    }
  }

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
              Registering a sell transfers your bRENT into a program-owned
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
            disabled={submitting || !amountUi || parseFloat(amountUi) <= 0}
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
