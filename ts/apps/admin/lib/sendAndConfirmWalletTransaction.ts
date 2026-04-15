import bs58 from "bs58"
import { clusterApiUrl, type Commitment, Connection, PublicKey, Transaction } from "@solana/web3.js"
import type { ProgramWallet } from "./program"

const FALLBACK_TESTNET_RPC_ENDPOINTS = [
  clusterApiUrl("testnet"),
  "https://solana-testnet-rpc.publicnode.com",
]

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
}: {
  connection: Connection
  wallet: ProgramWallet
  transaction: Transaction
  commitment?: Commitment
}): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected")
  }

  const endpoints = Array.from(
    new Set([connection.rpcEndpoint, ...FALLBACK_TESTNET_RPC_ENDPOINTS].filter(Boolean)),
  )

  let blockhashInfo: Awaited<ReturnType<Connection["getLatestBlockhash"]>> | null = null
  let blockhashError: unknown = null

  for (const endpoint of endpoints) {
    const txConnection = endpoint === connection.rpcEndpoint ? connection : new Connection(endpoint, commitment)
    try {
      blockhashInfo = await txConnection.getLatestBlockhash(commitment)
      break
    } catch (error) {
      blockhashError = error
    }
  }

  if (!blockhashInfo) {
    throw blockhashError instanceof Error
      ? blockhashError
      : new Error("Failed to load a recent blockhash from all configured RPC endpoints")
  }

  const txToSign = new Transaction()
  txToSign.add(...transaction.instructions)
  txToSign.feePayer ??= wallet.publicKey
  txToSign.recentBlockhash = blockhashInfo.blockhash

  const signedTransaction = await wallet.signTransaction(txToSign)
  const signature = encodeWalletSignature(signedTransaction, wallet.publicKey)
  if (!signature) {
    throw new Error("Wallet did not return a transaction signature")
  }

  let lastError: unknown

  for (const endpoint of endpoints) {
    const txConnection = endpoint === connection.rpcEndpoint ? connection : new Connection(endpoint, commitment)

    try {
      try {
        await txConnection.sendRawTransaction(signedTransaction.serialize(), {
          preflightCommitment: commitment,
        })
      } catch (error) {
        if (!isAlreadyProcessedError(error)) {
          throw error
        }
      }

      const confirmation = await txConnection.confirmTransaction(
        { signature, blockhash: blockhashInfo.blockhash, lastValidBlockHeight: blockhashInfo.lastValidBlockHeight },
        commitment,
      )

      if (confirmation.value.err) {
        throw new Error(JSON.stringify(confirmation.value.err))
      }

      return signature
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Transaction failed on all configured RPC endpoints")
}
