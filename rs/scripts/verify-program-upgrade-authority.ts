/**
 * Verifies the Solana upgrade authority for the deployed BunkerCash program.
 *
 * Run:
 *   cd rs
 *   export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
 *   export ANCHOR_WALLET=~/.config/solana/id.json
 *   export SQUADS_PROGRAM_UPGRADE_AUTHORITY=<confirmed-squads-controlled-authority>
 *   npx ts-node -P tsconfig.json scripts/verify-program-upgrade-authority.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, type Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  printUpgradeAuthorityStatus,
  verifyProgramUpgradeAuthority,
} from "./governance";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const idlJson = require("../../ts/apps/web/lib/bunkercash.fixed.idl.json") as {
  address: string;
} & Idl;

async function main() {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const programId = new PublicKey(idlJson.address);
  const status = await verifyProgramUpgradeAuthority({
    provider,
    programId,
    deployerWallet: provider.wallet.publicKey,
  });

  printUpgradeAuthorityStatus(status);
  console.log(`CLI check: solana program show ${programId.toBase58()}`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
