'use client'

import { useState, useMemo } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { FileText, AlertCircle, Building2, MapPin, CheckCircle2, Loader2, ExternalLink, Send } from 'lucide-react'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { useSquadsTransaction } from '@/hooks/useSquadsTransaction'
import type { SquadsSubmitResult } from '@/hooks/useSquadsTransaction'
import { getClusterFromEndpoint, getUsdcMintForCluster, SQUADS_VAULT_PUBKEY } from '@/lib/constants'

const USDC_DECIMALS = 6

export function AdminWithdraw() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const { isGovernedBySquads } = useIsAdmin()
  const { submit: submitSquads, isSubmitting: isSquadsSubmitting, error: squadsError, result: squadsResult } =
    useSquadsTransaction()

  const [amount, setAmount] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('')
  const [documentHash, setDocumentHash] = useState('')
  const [propertyAddress, setPropertyAddress] = useState('')
  const [propertyValue, setPropertyValue] = useState('')
  const [loanAmount, setLoanAmount] = useState('')
  const [ltv, setLtv] = useState('')
  const [description, setDescription] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txSig, setTxSig] = useState<string | null>(null)
  const [squadsProposal, setSquadsProposal] = useState<SquadsSubmitResult | null>(null)

  const cluster = useMemo(
    () => getClusterFromEndpoint(connection.rpcEndpoint ?? ''),
    [connection],
  )
  const usdcMint = useMemo(() => getUsdcMintForCluster(cluster), [cluster])

  const usdcAmount = useMemo(() => {
    const raw = parseFloat(amount.replace(/[^0-9.]/g, ''))
    if (isNaN(raw) || raw <= 0) return null
    return BigInt(Math.round(raw * 10 ** USDC_DECIMALS))
  }, [amount])

  const recipientPubkey = useMemo(() => {
    try {
      return new PublicKey(recipientAddress)
    } catch {
      return null
    }
  }, [recipientAddress])

  const busy = isSubmitting || isSquadsSubmitting

  const getExplorerTxUrl = (sig: string) => {
    const base = `https://explorer.solana.com/tx/${sig}`
    return cluster === 'mainnet-beta' ? base : `${base}?cluster=${cluster}`
  }

  const handleWithdraw = async () => {
    if (!usdcMint || !usdcAmount || !recipientPubkey) return
    if (busy) return

    setIsSubmitting(true)
    setError(null)
    setTxSig(null)
    setSquadsProposal(null)

    try {
      // Derive the recipient's USDC ATA
      // allowOwnerOffCurve = true so PDA recipients (e.g. multisig vaults) work
      const recipientUsdcAta = getAssociatedTokenAddressSync(
        usdcMint,
        recipientPubkey,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      )

      const memo = [
        `Withdraw ${amount} USDC → ${recipientPubkey.toBase58().slice(0, 8)}…`,
        documentHash && `doc:${documentHash.slice(0, 16)}…`,
        propertyAddress && `prop:${propertyAddress}`,
        description && description.slice(0, 80),
      ]
        .filter(Boolean)
        .join(' | ')

      if (isGovernedBySquads) {
        // ── Squads flow ──────────────────────────────────────────────────────
        // The Squads vault PDA is the USDC source (its own USDC ATA).
        if (!SQUADS_VAULT_PUBKEY) {
          throw new Error('Squads vault PDA is not available. Ensure NEXT_PUBLIC_SQUADS_MULTISIG_PUBKEY is set in .env.local')
        }

        const vaultUsdcAta = getAssociatedTokenAddressSync(
          usdcMint,
          SQUADS_VAULT_PUBKEY,
          true,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        )

        // Idempotently create recipient's USDC ATA if it doesn't exist yet.
        // The vault pays for the ATA creation rent inside the vault transaction.
        const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
          SQUADS_VAULT_PUBKEY,
          recipientUsdcAta,
          recipientPubkey,
          usdcMint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        )

        // SPL transfer: vault USDC ATA → recipient USDC ATA
        // The vault PDA is the authority (Squads vault transaction signer).
        const transferIx = createTransferInstruction(
          vaultUsdcAta,
          recipientUsdcAta,
          SQUADS_VAULT_PUBKEY, // authority = vault PDA
          usdcAmount,
          [],
          TOKEN_PROGRAM_ID,
        )

        const out = await submitSquads([createAtaIx, transferIx], memo)
        if (out) {
          setSquadsProposal(out)
          resetForm()
        }
      } else {
        // ── Direct wallet flow ───────────────────────────────────────────────
        if (!wallet.publicKey || !wallet.signTransaction) {
          throw new Error('Wallet not connected')
        }

        const sourceUsdcAta = getAssociatedTokenAddressSync(
          usdcMint,
          wallet.publicKey,
          false,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        )

        // Idempotently create recipient's ATA (admin pays rent).
        const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          recipientUsdcAta,
          recipientPubkey,
          usdcMint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        )

        const transferIx = createTransferInstruction(
          sourceUsdcAta,
          recipientUsdcAta,
          wallet.publicKey,
          usdcAmount,
          [],
          TOKEN_PROGRAM_ID,
        )

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
        const tx = new Transaction().add(createAtaIx).add(transferIx)
        tx.recentBlockhash = blockhash
        tx.feePayer = wallet.publicKey

        const sig = await wallet.sendTransaction(tx, connection, {
          preflightCommitment: 'confirmed',
        })
        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
        setTxSig(sig)
        resetForm()
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to withdraw')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setAmount('')
    setRecipientAddress('')
    setDocumentHash('')
    setPropertyAddress('')
    setPropertyValue('')
    setLoanAmount('')
    setLtv('')
    setDescription('')
  }

  const canSubmit =
    !!amount &&
    !!usdcAmount &&
    !!recipientAddress &&
    !!recipientPubkey &&
    !!documentHash &&
    !!propertyAddress &&
    !!propertyValue &&
    !!loanAmount &&
    !!ltv &&
    !!description

  const displayError = error ?? squadsError

  return (
    <div className="space-y-6">
      {/* Context banner */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-200/80">
            <p className="font-medium text-yellow-300 mb-1">Authorized Withdrawals Only</p>
            <p className="text-xs text-yellow-200/60">
              {isGovernedBySquads
                ? 'Creates a Squads vault transaction proposal. The required number of multisig members must approve before funds transfer.'
                : 'All withdrawals must be backed by notarized documents proving secured and overcollateralized debt.'}
            </p>
          </div>
        </div>
      </div>

      {/* Success: direct tx */}
      {txSig && (
        <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-green-300 mb-1">Withdrawal confirmed</p>
            <a
              href={getExplorerTxUrl(txSig)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-green-200/60 hover:text-green-200 font-mono underline underline-offset-2"
            >
              {txSig.slice(0, 16)}… <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* Success: Squads proposal */}
      {squadsProposal && (
        <div className="flex items-start gap-3 bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
          <CheckCircle2 className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm flex-1">
            <p className="font-medium text-purple-300 mb-1">
              Squads proposal created — tx&nbsp;#{squadsProposal.txIndex.toString()}
            </p>
            <p className="text-xs text-purple-200/60 mb-2">
              Your approval has been cast. Share the link below with other multisig members.
            </p>
            <a
              href={squadsProposal.squadsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-purple-300 hover:text-purple-200 underline underline-offset-2"
            >
              Open in Squads <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* Error */}
      {displayError && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{displayError}</p>
        </div>
      )}

      <div className="space-y-4">
        {/* Amount */}
        <div>
          <label className="block text-sm text-neutral-400 mb-2">Amount (USDC)</label>
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              disabled={busy}
              className="bg-transparent text-2xl font-medium w-full outline-none disabled:opacity-50"
            />
          </div>
        </div>

        {/* Recipient */}
        <div>
          <label className="block text-sm text-neutral-400 mb-2">Recipient Address</label>
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <div className="flex items-center gap-3">
              <Send className="w-5 h-5 text-neutral-500 flex-shrink-0" />
              <input
                type="text"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="Solana wallet address of the borrower"
                disabled={busy}
                className="bg-transparent text-sm font-mono w-full outline-none disabled:opacity-50"
              />
            </div>
          </div>
          {recipientAddress && !recipientPubkey && (
            <p className="text-xs text-red-400 mt-1">Invalid Solana address</p>
          )}
        </div>

        {/* Document Hash */}
        <div>
          <label className="block text-sm text-neutral-400 mb-2">
            Document Hash (SHA-256)
          </label>
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-neutral-500 flex-shrink-0" />
              <input
                type="text"
                value={documentHash}
                onChange={(e) => setDocumentHash(e.target.value)}
                placeholder="Hash of notarized digital document"
                disabled={busy}
                className="bg-transparent text-sm font-mono w-full outline-none disabled:opacity-50"
              />
            </div>
          </div>
          <p className="text-xs text-neutral-600 mt-2">
            SHA-256 hash of the notarized document proving loan security and overcollateralization
          </p>
        </div>

        {/* Property Address */}
        <div>
          <label className="block text-sm text-neutral-400 mb-2">Property Address</label>
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-neutral-500 flex-shrink-0" />
              <input
                type="text"
                value={propertyAddress}
                onChange={(e) => setPropertyAddress(e.target.value)}
                placeholder="123 Main Street, City, State, ZIP"
                disabled={busy}
                className="bg-transparent text-sm w-full outline-none disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* Property Value + Loan Amount */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-2">Property Value</label>
            <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
              <input
                type="text"
                value={propertyValue}
                onChange={(e) => setPropertyValue(e.target.value)}
                placeholder="$500,000"
                disabled={busy}
                className="bg-transparent text-sm w-full outline-none disabled:opacity-50"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-2">Loan Amount</label>
            <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
              <input
                type="text"
                value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
                placeholder="$300,000"
                disabled={busy}
                className="bg-transparent text-sm w-full outline-none disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* LTV */}
        <div>
          <label className="block text-sm text-neutral-400 mb-2">
            Loan-to-Value Ratio (LTV)
          </label>
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-neutral-500 flex-shrink-0" />
              <input
                type="text"
                value={ltv}
                onChange={(e) => setLtv(e.target.value)}
                placeholder="60%"
                disabled={busy}
                className="bg-transparent text-sm w-full outline-none disabled:opacity-50"
              />
            </div>
          </div>
          <p className="text-xs text-neutral-600 mt-2">Must be ≤70% for overcollateralization</p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm text-neutral-400 mb-2">Usage Description</label>
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Property acquisition - secured loan at 60% LTV for residential rental property"
              rows={4}
              disabled={busy}
              className="bg-transparent text-sm w-full outline-none resize-none disabled:opacity-50"
            />
          </div>
        </div>

        <button
          onClick={handleWithdraw}
          disabled={!canSubmit || busy}
          className="w-full bg-[#00FFB2] hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600 text-black font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {busy
            ? isGovernedBySquads
              ? 'Creating proposal…'
              : 'Withdrawing…'
            : isGovernedBySquads
              ? 'Propose Withdrawal via Squads'
              : 'Execute Withdrawal'}
        </button>
      </div>
    </div>
  )
}
