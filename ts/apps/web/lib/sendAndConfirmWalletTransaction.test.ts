import { describe, expect, it, vi } from "vitest"
import { Keypair, Transaction, TransactionInstruction } from "@solana/web3.js"
import {
  isAlreadyProcessedError,
  sendAndConfirmWalletTransaction,
} from "./sendAndConfirmWalletTransaction"

const payer = Keypair.generate()
const recipient = Keypair.generate().publicKey
const blockhash = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N"
const mockSignatureBytes = new Uint8Array(64).fill(7)

function createTransaction() {
  return new Transaction().add(
    new TransactionInstruction({
      keys: [],
      programId: recipient,
      data: Buffer.alloc(0),
    }),
  )
}

function createSignedTransaction() {
  const tx = createTransaction() as Transaction & {
    serialize: ReturnType<typeof vi.fn>
  }
  Object.defineProperty(tx, "signature", {
    value: mockSignatureBytes,
    configurable: true,
  })
  Object.defineProperty(tx, "signatures", {
    value: [
      {
        publicKey: payer.publicKey,
        signature: mockSignatureBytes,
      },
    ],
    configurable: true,
  })
  tx.serialize = vi.fn().mockReturnValue(Buffer.from([1, 2, 3]))
  return tx
}

describe("isAlreadyProcessedError", () => {
  it("detects duplicate-processing messages", () => {
    expect(
      isAlreadyProcessedError(
        new Error("Transaction simulation failed: This transaction has already been processed."),
      ),
    ).toBe(true)
    expect(isAlreadyProcessedError(new Error("Blockhash not found"))).toBe(false)
  })
})

describe("sendAndConfirmWalletTransaction", () => {
  it("returns the known signature when RPC reports an already-processed transaction", async () => {
    const signedTransaction = createSignedTransaction()
    signedTransaction.recentBlockhash = blockhash
    signedTransaction.feePayer = payer.publicKey

    const connection = {
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash,
        lastValidBlockHeight: 123,
      }),
      sendRawTransaction: vi
        .fn()
        .mockRejectedValue(
          new Error("This transaction has already been processed."),
        ),
      confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
    }

    const wallet = {
      publicKey: payer.publicKey,
      signTransaction: vi.fn().mockResolvedValue(signedTransaction),
      signAllTransactions: vi.fn(),
    }

    const signature = await sendAndConfirmWalletTransaction({
      connection: connection as never,
      wallet,
      transaction: createTransaction(),
    })

    expect(signature).toBeTruthy()
    expect(wallet.signTransaction).toHaveBeenCalledTimes(1)
    expect(connection.sendRawTransaction).toHaveBeenCalledTimes(1)
    expect(connection.confirmTransaction).toHaveBeenCalledWith(
      {
        signature,
        blockhash,
        lastValidBlockHeight: 123,
      },
      "confirmed",
    )
  })

  it("throws when the confirmed transaction has an on-chain error", async () => {
    const signedTransaction = createSignedTransaction()
    signedTransaction.recentBlockhash = blockhash
    signedTransaction.feePayer = payer.publicKey

    const connection = {
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash,
        lastValidBlockHeight: 123,
      }),
      sendRawTransaction: vi.fn().mockResolvedValue("ignored"),
      confirmTransaction: vi.fn().mockResolvedValue({
        value: { err: { InstructionError: [0, "Custom"] } },
      }),
    }

    const wallet = {
      publicKey: payer.publicKey,
      signTransaction: vi.fn().mockResolvedValue(signedTransaction),
      signAllTransactions: vi.fn(),
    }

    await expect(
      sendAndConfirmWalletTransaction({
        connection: connection as never,
        wallet,
        transaction: createTransaction(),
      }),
    ).rejects.toThrow('{"InstructionError":[0,"Custom"]}')
  })
})
