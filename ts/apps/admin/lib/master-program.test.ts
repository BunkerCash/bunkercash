import { describe, expect, it } from "vitest";
import {
  getMasterOpsPda,
  getMasterPoolPda,
  getMasterWithdrawalPda,
  MASTER_PROGRAM_ID,
} from "@/lib/master-program";

describe("master-program PDA derivation", () => {
  it("derives the current pool PDA deterministically", () => {
    expect(getMasterPoolPda(MASTER_PROGRAM_ID).toBase58()).toBe(
      "6jymNtocKLECpahNSqKrWHuMF8vCXgPhYAKVTBZKJsJY"
    );
  });

  it("derives the current master-ops PDA deterministically", () => {
    expect(getMasterOpsPda(MASTER_PROGRAM_ID).toBase58()).toBe(
      "5GrKZtZu9LkW42JVSzG8SH3rKAEVxHrDaK1nm3H1Go4Y"
    );
  });

  it("derives withdrawal PDAs for known ids", () => {
    expect(getMasterWithdrawalPda(BigInt(1), MASTER_PROGRAM_ID).toBase58()).toBe(
      "E8ckjccrV9tCpunFQpFvBpHyCY5WVHhQsy1tLVpzb8Qa"
    );
    expect(getMasterWithdrawalPda(BigInt(7), MASTER_PROGRAM_ID).toBase58()).toBe(
      "DZovjdG7ZHv9haRpFCKfxT3NnJzEHwaL3HYQfbtH6nLP"
    );
  });
});
