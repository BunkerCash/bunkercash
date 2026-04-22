import { Connection } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getBunkercashMintPda, PROGRAM_ID } from "@/lib/program";

export async function fetchHolderCount(connection: Connection): Promise<number> {
  const mintPda = getBunkercashMintPda(PROGRAM_ID);

  const accounts = await connection.getParsedProgramAccounts(
    TOKEN_2022_PROGRAM_ID,
    {
      filters: [
        { dataSize: 165 },
        { memcmp: { offset: 0, bytes: mintPda.toBase58() } },
      ],
    },
  );

  const holders = new Set<string>();

  for (const { account } of accounts) {
    const parsed = account.data;
    if (!("parsed" in parsed)) continue;

    const info = parsed.parsed?.info as
      | { owner?: string; tokenAmount?: { uiAmount?: number } }
      | undefined;
    if (!info?.owner) continue;

    const balance = info.tokenAmount?.uiAmount ?? 0;
    if (balance > 0) {
      holders.add(info.owner);
    }
  }

  return holders.size;
}
