import { describe, expect, it } from "vitest";
import {
  getMasterPoolPda,
  getMasterWithdrawalPda,
  MASTER_PROGRAM_ID,
} from "@/lib/master-program";

describe("master-program PDA derivation", () => {
  it("derives the current pool PDA deterministically", () => {
    expect(getMasterPoolPda(MASTER_PROGRAM_ID).toBase58()).toBe(
      "DhKPBb5R8xG8U3obBcWwFXvLXhAFrY5YbRz9FCtjKZzN"
    );
  });

  it("derives withdrawal PDAs for known ids", () => {
    expect(getMasterWithdrawalPda(BigInt(1), MASTER_PROGRAM_ID).toBase58()).toBe(
      "8RkMsoQpqZko9ACyWUxiGrDgLbZSWx8mbebjePUuyT83"
    );
    expect(getMasterWithdrawalPda(BigInt(7), MASTER_PROGRAM_ID).toBase58()).toBe(
      "4Wy78tw5rMqEdjDJq84rHtQz6DTDbuwaHQ7g2p6EiL1J"
    );
  });
});
