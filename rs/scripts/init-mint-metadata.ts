import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";

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
  console.log("Program:", program.programId.toBase58());

  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_SEED)],
    PROGRAM_ID
  );
  const [mintPubkey] = PublicKey.findProgramAddressSync(
    [Buffer.from("bunkercash_mint")],
    PROGRAM_ID
  );
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mintPubkey.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );

  const name = process.env.TOKEN_NAME ?? "bRENT";
  const symbol = process.env.TOKEN_SYMBOL ?? "bRENT";
  const uri = requiredEnv("TOKEN_URI");

  console.log("Pool PDA:", poolPda.toBase58());
  console.log("BunkerCash mint:", mintPubkey.toBase58());
  console.log("Metadata PDA:", metadataPda.toBase58());
  console.log("Name:", name);
  console.log("Symbol:", symbol);
  console.log("URI:", uri);

  const sig = await (program.methods as any)
    .initMintMetadata(name, symbol, uri)
    .accounts({
      pool: poolPda,
      bunkercashMint: mintPubkey,
      admin: provider.wallet.publicKey,
      metadata: metadataPda,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      tokenProgram: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
      systemProgram: SystemProgram.programId,
      sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .rpc({ commitment: "confirmed" });

  console.log("init_mint_metadata tx:", sig);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
