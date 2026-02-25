/**
 * Transfer pool admin to a new address (current admin only).
 *
 * Run:
 *   cd rs
 *   export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
 *   export ANCHOR_WALLET=~/.config/solana/id.json
 *   export NEW_ADMIN_PUBKEY=4dFqVU46i6wwUc1Y9Sz8MnunaZZRKnpPHF9gNLNLYuKq
 *   npx ts-node -P tsconfig.json scripts/update-admin.ts
 *
 * Use NEW_ADMIN_PUBKEY = your Squads vault (index 0) to hand over to Squads.
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
  const wallet = provider.wallet.publicKey;

  const newAdminStr = process.env.NEW_ADMIN_PUBKEY;
  if (!newAdminStr) {
    console.error("Set NEW_ADMIN_PUBKEY (base58 address of the new admin).");
    process.exit(1);
  }
  const newAdmin = new PublicKey(newAdminStr);

  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bunkercash_pool")],
    program.programId
  );

  const sig = await (program.methods as any)
    .updateAdmin(newAdmin)
    .accounts({ pool: poolPda, admin: wallet })
    .rpc({ commitment: "confirmed" });

  console.log("update_admin tx:", sig);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
