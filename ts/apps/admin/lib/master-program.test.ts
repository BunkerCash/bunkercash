import { describe, expect, it } from "vitest";
import {
  getMasterPoolPda,
  getMasterWithdrawalPda,
  MASTER_PROGRAM_ID,
} from "@/lib/master-program";

describe("master-program PDA derivation", () => {
  it("derives the current pool PDA deterministically", () => {
    expect(getMasterPoolPda(MASTER_PROGRAM_ID).toBase58()).toBe(
      "BF7L1FWXKV15c6YkGACjwxKxDn8imuc8m9RQQDCnS54W"
    );
  });

  it("derives withdrawal PDAs for known ids", () => {
    expect(getMasterWithdrawalPda(BigInt(1), MASTER_PROGRAM_ID).toBase58()).toBe(
      "BLYj2t4Sjmywh4zqQtAyESuA1neQFjpenRehE2JSZZuv"
    );
    expect(getMasterWithdrawalPda(BigInt(7), MASTER_PROGRAM_ID).toBase58()).toBe(
      "EtjgCAgkkkJyPmq7NZM3gWGH6z3xjo3w15cJ1ETdTxVM"
    );
  });
});
