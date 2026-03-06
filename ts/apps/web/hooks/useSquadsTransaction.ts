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
  getClusterFromEndpoint,
} from "@/lib/constants"

export type SquadsSubmitResult = {
  /** Squads v4 transaction index */
  txIndex: bigint
  /** Proposal PDA (derived from multisig + txIndex) */
  proposalPda: string
  /** Transaction PDA (derived from multisig + txIndex) */
  transactionPda: string
  /** Deep-link URL to the Squads app for this transaction */
  squadsUrl: string
  /** Signature of the vault-transaction-create tx */
  signature: string
  /** Whether the creator's approval was included */
  autoApproved: boolean
}

function assertSquadsConfigured() {
  if (!SQUADS_MULTISIG_PUBKEY || !SQUADS_VAULT_PUBKEY) {
    throw new Error(
      "Squads v4 is not configured. " +
        "SQUADS_VAULT_PUBKEY could not be derived because NEXT_PUBLIC_SQUADS_MULTISIG_PUBKEY is not set.\n" +
        "Add it to ts/apps/web/.env.local and restart the dev server.",
    )
  }
}

/**
 * Hook for creating Squads v4 vault transaction proposals.
 *
 * Wraps the given instructions in a vault transaction, creates the proposal,
 * and immediately casts the creator's approval.
 *
 * Because the serialized inner message can be large, the work is split across
 * two on-chain transactions to stay under Solana's 1232-byte packet limit:
 *   TX 1 – vaultTransactionCreate  (contains the full serialized inner message)
 *   TX 2 – proposalCreate + proposalApprove
 *
 * Both are signed together via `signAllTransactions` for a single wallet popup,
 * then sent sequentially (TX 2 depends on TX 1 being confirmed).
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
      if (!wallet.publicKey || !wallet.signAllTransactions) {
        setError("Wallet not connected")
        return null
      }

      if (instructions.length === 0) {
        setError("No instructions provided — cannot create an empty proposal")
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

        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed")

        // ── 2. Build the vault transaction message ────────────────────────────
        const innerMessage = new TransactionMessage({
          payerKey: vaultPda,
          recentBlockhash: blockhash,
          instructions,
        })

        // ── 3. Build outer instructions ───────────────────────────────────────
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
          isDraft: false,
        })

        const approveProposalIx = multisig.instructions.proposalApprove({
          multisigPda,
          transactionIndex: nextIndex,
          member: wallet.publicKey,
          memo: memo ? `approve: ${memo}` : undefined,
        })

        // ── 4. Split into two transactions to stay under the 1232-byte limit ─
        //   TX 1: vaultTransactionCreate (large — carries the serialized inner message)
        //   TX 2: proposalCreate + proposalApprove (small — only Squads PDAs)
        const tx1Message = new TransactionMessage({
          payerKey: wallet.publicKey,
          recentBlockhash: blockhash,
          instructions: [createVaultTxIx],
        }).compileToV0Message()

        const tx2Message = new TransactionMessage({
          payerKey: wallet.publicKey,
          recentBlockhash: blockhash,
          instructions: [createProposalIx, approveProposalIx],
        }).compileToV0Message()

        const vtx1 = new VersionedTransaction(tx1Message)
        const vtx2 = new VersionedTransaction(tx2Message)

        // Sign both at once → single wallet popup for the user
        const signed = await wallet.signAllTransactions([vtx1, vtx2])
        if (!signed || signed.length < 2) {
          throw new Error("Wallet returned fewer signed transactions than expected")
        }
        const [signed1, signed2] = signed

        // ── 5. Send TX 1 and wait for confirmation ───────────────────────────
        const sig1 = await connection.sendTransaction(signed1, {
          preflightCommitment: "confirmed",
        })
        await connection.confirmTransaction(
          { signature: sig1, blockhash, lastValidBlockHeight },
          "confirmed",
        )

        // ── 6. Send TX 2 (proposal + approve) ───────────────────────────────
        // If the original blockhash expired while waiting for TX1, retry with a fresh one.
        let sig2: string
        try {
          sig2 = await connection.sendTransaction(signed2, {
            preflightCommitment: "confirmed",
          })
          await connection.confirmTransaction(
            { signature: sig2, blockhash, lastValidBlockHeight },
            "confirmed",
          )
        } catch (tx2Error: unknown) {
          const msg = tx2Error instanceof Error ? tx2Error.message : ""
          if (!msg.includes("blockhash")) throw tx2Error

          const fresh = await connection.getLatestBlockhash("confirmed")
          const retryMsg = new TransactionMessage({
            payerKey: wallet.publicKey,
            recentBlockhash: fresh.blockhash,
            instructions: [createProposalIx, approveProposalIx],
          }).compileToV0Message()
          const retryTx = new VersionedTransaction(retryMsg)
          const [retrySigned] = await wallet.signAllTransactions([retryTx])
          sig2 = await connection.sendTransaction(retrySigned, {
            preflightCommitment: "confirmed",
          })
          await connection.confirmTransaction(
            {
              signature: sig2,
              blockhash: fresh.blockhash,
              lastValidBlockHeight: fresh.lastValidBlockHeight,
            },
            "confirmed",
          )
        }

        // ── 7. Derive PDAs ────────────────────────────────────────────────────
        const [proposalPda] = multisig.getProposalPda({
          multisigPda,
          transactionIndex: nextIndex,
        })
        const [transactionPda] = multisig.getTransactionPda({
          multisigPda,
          index: nextIndex,
        })

        // ── 8. Build Squads deep-link URL ────────────────────────────────────
        const cluster = getClusterFromEndpoint(connection.rpcEndpoint ?? "")
        const squadsUrl = getSquadsDashboardUrl(cluster, multisigPda)

        const out: SquadsSubmitResult = {
          txIndex: nextIndex,
          proposalPda: proposalPda.toBase58(),
          transactionPda: transactionPda.toBase58(),
          squadsUrl,
          signature: sig1,
          autoApproved: true,
        }
        setResult(out)
        return out
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : "Failed to create Squads proposal"
        console.error("[useSquadsTransaction] error:", e)
        setError(msg)
        throw e
      } finally {
        setIsSubmitting(false)
      }
    },
    [connection, wallet],
  )

  return { submit, isSubmitting, error, result }
}
