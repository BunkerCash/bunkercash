import { describe, expect, it } from "vitest";
import {
  getMasterPoolPda,
  getMasterWithdrawalPda,
  MASTER_PROGRAM_ID,
} from "@/lib/master-program";

describe("master-program PDA derivation", () => {
  it("derives the current pool PDA deterministically", () => {
    expect(getMasterPoolPda(MASTER_PROGRAM_ID).toBase58()).toBe(
      "9i5uwwby6AH3xEeGMkNoCgvxtMjNdq1HBVHAfp9YVf8G"
    );
  });

  it("derives withdrawal PDAs for known ids", () => {
    expect(getMasterWithdrawalPda(BigInt(1), MASTER_PROGRAM_ID).toBase58()).toBe(
      "6M8WDsqeNMpSpzQ8MG6hZWhncrDrXqTnEF9b64N5jhHb"
    );
    expect(getMasterWithdrawalPda(BigInt(7), MASTER_PROGRAM_ID).toBase58()).toBe(
      "DUQRAd6PaVSeVs3ibg7uZp2AiZ2QNUjMkhHwxQFbyt4A"
    );
  });
});
