import { describe, expect, it } from "vitest";
import {
  getMasterPoolPda,
  getMasterWithdrawalPda,
  MASTER_PROGRAM_ID,
} from "@/lib/master-program";

describe("master-program PDA derivation", () => {
  it("derives the legacy pool PDA deterministically", () => {
    expect(getMasterPoolPda(MASTER_PROGRAM_ID).toBase58()).toBe(
      "B8HaeWnkkxfr5TpjsG1b72wVCPBHF7Fr8MqHnDjcuQkS"
    );
  });

  it("derives withdrawal PDAs for known ids", () => {
    expect(getMasterWithdrawalPda(BigInt(0), MASTER_PROGRAM_ID).toBase58()).toBe(
      "HE5rBNWbAXoRaj7AvbsXGBQ1nYgiMyeoxS9TqTn6QcDt"
    );
    expect(getMasterWithdrawalPda(BigInt(7), MASTER_PROGRAM_ID).toBase58()).toBe(
      "8mdEYEXp8K6TyiM4bKCCLaQvDfGBUN5DmLAryjbvS3qD"
    );
  });
});
