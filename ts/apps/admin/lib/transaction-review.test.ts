import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import {
  buildTransactionReview,
  formatTransactionReview,
  requirePreSignReview,
} from "./transaction-review";

describe("transaction review disclosure", () => {
  it("displays the same program and accounts as the submitted instruction", () => {
    const programId = PublicKey.unique();
    const writableSigner = PublicKey.unique();
    const readonlyAccount = PublicKey.unique();
    const instruction = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: writableSigner, isSigner: true, isWritable: true },
        { pubkey: readonlyAccount, isSigner: false, isWritable: false },
      ],
      data: Buffer.alloc(0),
    });

    const review = buildTransactionReview({
      instructions: [instruction],
      accountLabels: {
        [writableSigner.toBase58()]: "source vault",
        [readonlyAccount.toBase58()]: "mint",
      },
    });

    expect(review.instructions[0].programId).toBe(programId.toBase58());
    expect(review.instructions[0].accounts).toEqual([
      {
        label: "source vault",
        pubkey: writableSigner.toBase58(),
        isSigner: true,
        isWritable: true,
      },
      {
        label: "mint",
        pubkey: readonlyAccount.toBase58(),
        isSigner: false,
        isWritable: false,
      },
    ]);

    const text = formatTransactionReview(review);
    expect(text).toContain(`program ID: ${programId.toBase58()}`);
    expect(text).toContain(`source vault: ${writableSigner.toBase58()} (signer, writable)`);
    expect(text).toContain(`mint: ${readonlyAccount.toBase58()} (non-signer, readonly)`);
  });

  it("blocks signing when the signer rejects the pre-sign review", () => {
    const originalWindow = globalThis.window;
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("window", { confirm });

    expect(() =>
      requirePreSignReview(
        buildTransactionReview({
          instructions: [
            new TransactionInstruction({
              programId: PublicKey.unique(),
              keys: [],
              data: Buffer.alloc(0),
            }),
          ],
        }),
      ),
    ).toThrow("Transaction review rejected before signing");
    expect(confirm).toHaveBeenCalledTimes(1);

    vi.stubGlobal("window", originalWindow);
  });
});

