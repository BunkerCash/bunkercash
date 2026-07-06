import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { buildTransactionReview, formatTransactionReview } from "./transaction-review";

describe("transaction review disclosure", () => {
  it("formats program and account data from the submitted instruction", () => {
    const programId = PublicKey.unique();
    const source = PublicKey.unique();
    const destination = PublicKey.unique();
    const instruction = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: source, isSigner: true, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
      ],
      data: Buffer.alloc(0),
    });

    const review = buildTransactionReview({
      instructions: [instruction],
      accountLabels: {
        [source.toBase58()]: "source account",
        [destination.toBase58()]: "destination account",
      },
    });
    const text = formatTransactionReview(review);

    expect(review.instructions[0].programId).toBe(programId.toBase58());
    expect(review.instructions[0].accounts.map((account) => account.pubkey)).toEqual(
      instruction.keys.map((key) => key.pubkey.toBase58()),
    );
    expect(text).toContain(`program ID: ${programId.toBase58()}`);
    expect(text).toContain(`source account: ${source.toBase58()} (signer, writable)`);
    expect(text).toContain(`destination account: ${destination.toBase58()} (non-signer, writable)`);
  });
});

