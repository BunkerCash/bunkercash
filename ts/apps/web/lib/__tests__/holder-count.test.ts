import { describe, it, expect, vi, beforeEach } from "vitest";
import { Connection, PublicKey } from "@solana/web3.js";

vi.mock("@/lib/program", () => ({
  getBunkercashMintPda: vi.fn(() => new PublicKey("11111111111111111111111111111111")),
  PROGRAM_ID: new PublicKey("11111111111111111111111111111111"),
}));

import { fetchHolderCount } from "../holder-count";

function makeParsedAccount(owner: string, uiAmount: number) {
  return {
    pubkey: PublicKey.unique(),
    account: {
      data: {
        parsed: {
          info: {
            owner,
            tokenAmount: { uiAmount },
          },
        },
        program: "spl-token-2022",
        space: 165,
      },
      executable: false,
      lamports: 0,
      owner: PublicKey.default,
    },
  };
}

describe("fetchHolderCount", () => {
  let connection: Connection;

  beforeEach(() => {
    connection = {
      getParsedProgramAccounts: vi.fn(),
    } as unknown as Connection;
  });

  it("counts distinct holders with positive balance", async () => {
    const accounts = [
      makeParsedAccount("walletA", 100),
      makeParsedAccount("walletB", 50),
      makeParsedAccount("walletC", 0.001),
    ];
    vi.mocked(connection.getParsedProgramAccounts).mockResolvedValueOnce(
      accounts as never,
    );

    const count = await fetchHolderCount(connection);
    expect(count).toBe(3);
  });

  it("excludes zero-balance accounts", async () => {
    const accounts = [
      makeParsedAccount("walletA", 100),
      makeParsedAccount("walletB", 0),
      makeParsedAccount("walletC", 0),
    ];
    vi.mocked(connection.getParsedProgramAccounts).mockResolvedValueOnce(
      accounts as never,
    );

    const count = await fetchHolderCount(connection);
    expect(count).toBe(1);
  });

  it("deduplicates multiple token accounts for the same owner", async () => {
    const accounts = [
      makeParsedAccount("walletA", 100),
      makeParsedAccount("walletA", 50),
      makeParsedAccount("walletB", 25),
    ];
    vi.mocked(connection.getParsedProgramAccounts).mockResolvedValueOnce(
      accounts as never,
    );

    const count = await fetchHolderCount(connection);
    expect(count).toBe(2);
  });

  it("returns 0 when no accounts exist", async () => {
    vi.mocked(connection.getParsedProgramAccounts).mockResolvedValueOnce([]);
    const count = await fetchHolderCount(connection);
    expect(count).toBe(0);
  });
});
