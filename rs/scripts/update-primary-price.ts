/**
 * One-off script to set primary sale price to 1 USDC = 1 BRENT.
 * Run with the same wallet that initialized the primary pool (master_wallet).
 *
 * cd rs
 * export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
 * export ANCHOR_WALLET=~/.config/solana/id.json
 * npx ts-node -P tsconfig.json scripts/update-primary-price.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Bunkercash } from "../target/types/bunkercash";
import { PublicKey } from "@solana/web3.js";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const wallet = provider.wallet.publicKey;
  const program = anchor.workspace.Bunkercash as Program<Bunkercash>;

  const [primaryPool] = PublicKey.findProgramAddressSync(
    [Buffer.from("primary_pool")],
    program.programId
  );

  const newPrice = new anchor.BN(1_000_000); // 1 USDC = 1 BRENT

  const tx = await program.methods
    .updatePrimaryPrice(newPrice)
    .accounts({
      primaryPool,
      authority: wallet,
    } as any)
    .rpc({ commitment: "confirmed" });

  console.log("Primary price updated to 1 USDC = 1 BRENT");
  console.log("Tx:", tx);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
