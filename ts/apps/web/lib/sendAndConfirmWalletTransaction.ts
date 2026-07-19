import bs58 from "bs58"
import type { Commitment, Connection, PublicKey, Transaction } from "@solana/web3.js"
import type { ProgramWallet } from "./program"

function encodeWalletSignature(
  transaction: Transaction,
  walletPublicKey: PublicKey,
): string | null {
  if (transaction.signature) return bs58.encode(transaction.signature)
  const walletSignature = transaction.signatures.find((entry) =>
    entry.publicKey.equals(walletPublicKey),
  )?.signature
  return walletSignature ? bs58.encode(walletSignature) : null
}

export function isAlreadyProcessedError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error ?? "")
  return message.toLowerCase().includes("already been processed")
}

export async function sendAndConfirmWalletTransaction({
  connection,
  wallet,
  transaction,
  commitment = "confirmed",
  onSigned,
}: {
  connection: Connection
  wallet: ProgramWallet
  transaction: Transaction
  commitment?: Commitment
  /** Called with the signature once the wallet has signed, before confirmation. */
  onSigned?: (signature: string) => void
}): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected")
  }

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash(commitment)

  transaction.feePayer ??= wallet.publicKey
  transaction.recentBlockhash = blockhash

  const signedTransaction = await wallet.signTransaction(transaction)
  const signature = encodeWalletSignature(signedTransaction, wallet.publicKey)
  if (!signature) {
    throw new Error("Wallet did not return a transaction signature")
  }
  onSigned?.(signature)

  try {
    await connection.sendRawTransaction(signedTransaction.serialize(), {
      preflightCommitment: commitment,
    })
  } catch (error) {
    if (!isAlreadyProcessedError(error)) {
      throw error
    }
  }

  try {
    const confirmation = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      commitment,
    )

    if (confirmation.value.err) {
      throw new Error(JSON.stringify(confirmation.value.err))
    }
  } catch (error) {
    // A blockhash-expiry timeout does not mean the transaction failed — on a
    // lagging RPC the transaction often landed anyway. Check its actual status
    // before reporting failure to the user.
    const message = error instanceof Error ? error.message : String(error ?? "")
    const isExpiry =
      message.includes("block height exceeded") || message.includes("expired")
    if (!isExpiry) throw error

    const status = await connection.getSignatureStatus(signature, {
      searchTransactionHistory: true,
    })
    const confirmationStatus = status.value?.confirmationStatus
    const landed =
      status.value != null &&
      !status.value.err &&
      (confirmationStatus === "confirmed" || confirmationStatus === "finalized")
    if (!landed) throw error
  }

  return signature
}
