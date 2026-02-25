"use client"

import { useCallback, useState } from "react"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import {
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js"
import * as multisig from "@sqds/multisig"
import {
  SQUADS_MULTISIG_PUBKEY,
  SQUADS_VAULT_PUBKEY,
  getSquadsDashboardUrl,
} from "@/lib/constants"
import { getClusterFromEndpoint } from "@/lib/constants"

export type SquadsSubmitResult = {
  /** Squads v4 transaction index */
  txIndex: bigint
  /** Proposal PDA (derived from multisig + txIndex) */
  proposalPda: string
  /** Transaction PDA (derived from multisig + txIndex) */
  transactionPda: string
  /** Deep-link URL to the Squads app for this transaction */
  squadsUrl: string
  /** Signature of the create+approve transaction */
  signature: string
  /** Whether the creator's approval was included */
  autoApproved: boolean
}

function assertSquadsConfigured() {
  if (!SQUADS_MULTISIG_PUBKEY || !SQUADS_VAULT_PUBKEY) {
    throw new Error(
      "Squads v4 is not configured.\n" +
        "Set NEXT_PUBLIC_SQUADS_MULTISIG_PUBKEY in ts/apps/web/.env.local and restart dev server.",
    )
  }
}

/**
 * Hook for creating Squads v4 vault transaction proposals.
 *
 * Wraps the given instructions in a vault transaction, creates the proposal,
 * and immediately casts the creator's approval — all in a single on-chain
 * transaction. The other multisig members then open Squads to cast their votes.
 */
export function useSquadsTransaction() {
  const { connection } = useConnection()
  const wallet = useWallet()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SquadsSubmitResult | null>(null)

  const submit = useCallback(
    async (
      instructions: TransactionInstruction[],
      memo?: string,
    ): Promise<SquadsSubmitResult | null> => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        setError("Wallet not connected")
        return null
      }

      setIsSubmitting(true)
      setError(null)
      setResult(null)

      try {
        assertSquadsConfigured()

        const multisigPda = SQUADS_MULTISIG_PUBKEY!
        const vaultPda = SQUADS_VAULT_PUBKEY!

        // ── 1. Fetch multisig state ────────────────────────────────────────────
        const ms = await multisig.accounts.Multisig.fromAccountAddress(
          connection,
          multisigPda,
        )
        const currentIndex = BigInt(ms.transactionIndex.toString())
        const nextIndex = currentIndex + BigInt(1)

        // Verify caller is a multisig member
        const isMember = ms.members.some((m) =>
          m.key.equals(wallet.publicKey!),
        )
        if (!isMember) {
          throw new Error(
            `Your wallet is not a member of this Squads v4 multisig.\n` +
              `Wallet:   ${wallet.publicKey.toBase58()}\n` +
              `Multisig: ${multisigPda.toBase58()}`,
          )
        }

        const { blockhash } = await connection.getLatestBlockhash("confirmed")

        // ── 2. Build the vault transaction message ────────────────────────────
        // The "payer" of the inner message is the vault PDA (it pays for CPI).
        const innerMessage = new TransactionMessage({
          payerKey: vaultPda,
          recentBlockhash: blockhash,
          instructions,
        })

        // ── 3. Build outer instructions ───────────────────────────────────────
        // We combine three instructions into one outer transaction:
        //   a) vaultTransactionCreate  – stores the inner message on-chain
        //   b) proposalCreate          – creates the approval proposal (active)
        //   c) proposalApprove         – immediately casts the creator's vote
        const createVaultTxIx = multisig.instructions.vaultTransactionCreate({
          multisigPda,
          transactionIndex: nextIndex,
          creator: wallet.publicKey,
          vaultIndex: 0,
          ephemeralSigners: 0,
          transactionMessage: innerMessage,
          memo,
        })

        const createProposalIx = multisig.instructions.proposalCreate({
          multisigPda,
          creator: wallet.publicKey,
          transactionIndex: nextIndex,
          isDraft: false, // immediately active so members can vote
        })

        // Auto-approve: cast the creator's vote in the same transaction.
        // This saves a round-trip and immediately reaches quorum if threshold=1.
        const approveProposalIx = multisig.instructions.proposalApprove({
          multisigPda,
          transactionIndex: nextIndex,
          member: wallet.publicKey,
          memo: memo ? `approve: ${memo}` : undefined,
        })

        // ── 4. Build + sign outer versioned transaction ───────────────────────
        const outerMessage = new TransactionMessage({
          payerKey: wallet.publicKey,
          recentBlockhash: blockhash,
          instructions: [createVaultTxIx, createProposalIx, approveProposalIx],
        }).compileToV0Message()

        const vtx = new VersionedTransaction(outerMessage)
        const signed = (await wallet.signTransaction(vtx as never)) as VersionedTransaction
        const signature = await connection.sendTransaction(signed, {
          preflightCommitment: "confirmed",
        })
        await connection.confirmTransaction(signature, "confirmed")

        // ── 5. Derive PDAs ────────────────────────────────────────────────────
        const [proposalPda] = multisig.getProposalPda({
          multisigPda,
          transactionIndex: nextIndex,
        })
        const [transactionPda] = multisig.getTransactionPda({
          multisigPda,
          index: nextIndex,
        })

        // ── 6. Build Squads deep-link URL ────────────────────────────────────
        const cluster = getClusterFromEndpoint(connection.rpcEndpoint ?? "")
        const squadsUrl = getSquadsDashboardUrl(cluster, multisigPda)

        const out: SquadsSubmitResult = {
          txIndex: nextIndex,
          proposalPda: proposalPda.toBase58(),
          transactionPda: transactionPda.toBase58(),
          squadsUrl,
          signature,
          autoApproved: true,
        }
        setResult(out)
        return out
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : "Failed to create Squads proposal"
        setError(msg)
        return null
      } finally {
        setIsSubmitting(false)
      }
    },
    [connection, wallet],
  )

  return { submit, isSubmitting, error, result }
}
