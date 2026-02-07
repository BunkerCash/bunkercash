/**
 * Initialize Metaplex token metadata for the Bunker Cash mint PDA (Token-2022).
 *
 * Why: Phantom (and most wallets) display a fungible token nicely only when it has
 * token metadata (name/symbol/image URI). Our mint authority is a PDA (the pool),
 * so we must create metadata via a CPI signed by the program (see `init_mint_metadata`).
 *
 * Run:
 *   cd rs
 *   source scripts/devnet.env.example.sh
 *   export TOKEN_NAME="bRENT"
 *   export TOKEN_SYMBOL="bRENT"
 *   export TOKEN_URI="https://<your-public-host>/brent.json"
 *   npm run -s init:metadata
 *
 * Notes:
 * - You must deploy the program containing `init_mint_metadata` first.
 * - TOKEN_URI must be publicly accessible (JSON containing `name`, `symbol`, `image`, ...).
 */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const idlJson = require("../target/idl/bunkercash.json") as { address: string } & Idl;

const PROGRAM_ID = new PublicKey(idlJson.address);
const POOL_SEED = "bunkercash_pool";
const MINT_SEED = "bunkercash_mint";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function main() {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program(idlJson as unknown as Idl, provider);
  console.log("Program:", program.programId.toBase58());

  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_SEED)],
    PROGRAM_ID
  );
  const [mintPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(MINT_SEED)],
    PROGRAM_ID
  );
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mintPda.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );

  const name = process.env.TOKEN_NAME ?? "bRENT";
  const symbol = process.env.TOKEN_SYMBOL ?? "bRENT";
  const uri = requiredEnv("TOKEN_URI");

  console.log("Pool PDA:", poolPda.toBase58());
  console.log("Mint PDA:", mintPda.toBase58());
  console.log("Metadata PDA:", metadataPda.toBase58());
  console.log("Name:", name);
  console.log("Symbol:", symbol);
  console.log("URI:", uri);

  const sig = await (program.methods as any)
    .initMintMetadata(name, symbol, uri)
    .accounts({
      pool: poolPda,
      bunkercashMint: mintPda,
      admin: provider.wallet.publicKey,
      metadata: metadataPda,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      tokenProgram: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
      sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      systemProgram: SystemProgram.programId,
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

