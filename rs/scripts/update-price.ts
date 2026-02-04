/**
 * Update fixed price (admin only).
 *
 * Run:
 * cd rs
 * export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
 * export ANCHOR_WALLET=~/.config/solana/id.json
 * export NEW_PRICE_USDC_PER_TOKEN=1000000
 * npx ts-node -P tsconfig.json scripts/update-price.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
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

  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bunkercash_pool")],
    program.programId
  );

  const newPriceStr = process.env.NEW_PRICE_USDC_PER_TOKEN ?? "1000000";
  const newPrice = new BN(newPriceStr);

  const sig = await (program.methods as any)
    .updatePrice(newPrice)
    .accounts({ pool: poolPda, admin: wallet })
    .rpc({ commitment: "confirmed" });

  console.log("update_price tx:", sig);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

