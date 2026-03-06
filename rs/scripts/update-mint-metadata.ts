import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";


let idlJson: { address: string } & Idl;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  idlJson = require("../target/idl/bunkercash.json") as { address: string } & Idl;
} catch (e) {
  console.error("Failed to load target/idl/bunkercash.json. Run 'anchor build' first.");
  throw e;
}
const PROGRAM_ID = new PublicKey(idlJson.address);
const POOL_SEED = "pool";
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function main() {
  if (!process.env.ANCHOR_PROVIDER_URL) {
    throw new Error("ANCHOR_PROVIDER_URL is not set.");
  }
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idlJson as unknown as Idl, provider);

  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_SEED)],
    PROGRAM_ID
  );
  const mintPubkey = new PublicKey(requiredEnv("BRENT_MINT"));
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mintPubkey.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );

  const name = process.env.TOKEN_NAME ?? "Bunker Cash";
  const symbol = process.env.TOKEN_SYMBOL ?? "BunkerCash";
  const uri = requiredEnv("TOKEN_URI");

  const sig = await (program.methods as any)
    .updateMintMetadata(name, symbol, uri)
    .accounts({
      pool: poolPda,
      brent_mint: mintPubkey,
      admin: provider.wallet.publicKey,
      metadata: metadataPda,
      token_metadata_program: TOKEN_METADATA_PROGRAM_ID,
    })
    .rpc({ commitment: "confirmed" });

  console.log("update_mint_metadata tx:", sig);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
