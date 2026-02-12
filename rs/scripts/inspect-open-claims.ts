/**
 * Inspect open ClaimState accounts on a cluster.
 *
 * Prints the top N open claims by token_amount_locked and their usdc_paid.
 *
 * Run:
 *   cd rs
 *   source scripts/devnet.env.example.sh
 *   npx ts-node -P tsconfig.json scripts/inspect-open-claims.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const idlJson = require("../../ts/apps/web/lib/bunkercash.fixed.idl.json") as {
  address: string;
} & Idl;

async function main() {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program(idlJson as unknown as Idl, provider);

  const all = await (program.account as any).claimState.all();
  const open = all.filter((x: any) => !x.account.isClosed);

  const normalized = open.map((x: any) => ({
    pubkey: (x.publicKey as PublicKey).toBase58(),
    user: (x.account.user as PublicKey).toBase58(),
    id: x.account.id?.toString?.() ?? String(x.account.id),
    locked: x.account.tokenAmountLocked?.toString?.() ?? String(x.account.tokenAmountLocked),
    paid: x.account.usdcPaid?.toString?.() ?? String(x.account.usdcPaid),
  }));

  normalized.sort((a: any, b: any) => BigInt(b.locked) > BigInt(a.locked) ? 1 : -1);

  const topN = Number(process.env.TOP_N ?? "10");
  console.log("Cluster:", provider.connection.rpcEndpoint);
  console.log("Program:", program.programId.toBase58());
  console.log("Open claims:", normalized.length);
  console.log(`Top ${topN} by locked:`);
  for (const c of normalized.slice(0, topN)) {
    console.log(
      `- id=${c.id} locked=${c.locked} paid=${c.paid} user=${c.user} claim=${c.pubkey}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

