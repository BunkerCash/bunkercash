import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const val = argv[i + 1];
    if (!val || val.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    out[key] = val;
    i += 1;
  }
  return out;
}

function expandHome(path: string): string {
  return path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path;
}

function loadKeypair(path: string): Keypair {
  const file = readFileSync(expandHome(path), "utf8");
  const secret = Uint8Array.from(JSON.parse(file) as number[]);
  return Keypair.fromSecretKey(secret);
}

function getClusterFromRpc(rpcUrl: string): "devnet" | "testnet" | "mainnet-beta" {
  if (rpcUrl.includes("devnet")) return "devnet";
  if (rpcUrl.includes("testnet")) return "testnet";
  return "mainnet-beta";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = args.name?.trim();
  const symbol = args.symbol?.trim();
  const uri = args.uri?.trim();

  if (!name || !symbol || !uri) {
    throw new Error(
      "Usage: bun run apps/admin/scripts/setup-mint-and-metadata.ts --name <NAME> --symbol <SYMBOL> --uri <URI> [--rpc <RPC_URL>] [--keypair <PATH>]",
    );
  }

  const rpcUrl =
    args.rpc ??
    process.env.RPC_URL ??
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    "https://api.devnet.solana.com";

  const keypairPath = args.keypair ?? process.env.SOLANA_KEYPAIR ?? "~/.config/solana/id.json";
  const signer = loadKeypair(keypairPath);

  const idlRaw = readFileSync(resolve(process.cwd(), "../rs/target/idl/bunkercash.json"), "utf8");
  const idlJson = JSON.parse(idlRaw) as Idl & { address: string };
  const programId = new PublicKey(idlJson.address);

  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = {
    publicKey: signer.publicKey,
    signTransaction: async (tx: any) => {
      if (typeof tx.sign === "function") tx.sign(signer);
      else if (typeof tx.partialSign === "function") tx.partialSign(signer);
      return tx;
    },
    signAllTransactions: async (txs: any[]) =>
      txs.map((tx) => {
        if (typeof tx.sign === "function") tx.sign(signer);
        else if (typeof tx.partialSign === "function") tx.partialSign(signer);
        return tx;
      }),
  };

  const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
  const program = new Program(idlJson as Idl, provider);

  const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from("pool")], programId);
  const [mintPda] = PublicKey.findProgramAddressSync([Buffer.from("bunkercash_mint")], programId);
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintPda.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID,
  );

  const cluster = getClusterFromRpc(rpcUrl);

  console.log("Program ID:", programId.toBase58());
  console.log("Pool PDA:", poolPda.toBase58());
  console.log("Mint PDA:", mintPda.toBase58());
  console.log("Metadata PDA:", metadataPda.toBase58());
  console.log("Admin (signer):", signer.publicKey.toBase58());
  console.log();

  // Step 1: Create bRENT mint (if not already created)
  const mintAccount = await connection.getAccountInfo(mintPda);
  if (mintAccount) {
    console.log("Mint already exists, skipping create_brent_mint.");
  } else {
    console.log("Step 1: Creating bRENT mint...");
    const sig1 = await (program.methods as any)
      .createBrentMint()
      .accounts({
        pool: poolPda,
        brentMint: mintPda,
        admin: signer.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: PublicKey.default,
      })
      .rpc();

    const explorer1 =
      cluster === "mainnet-beta"
        ? `https://explorer.solana.com/tx/${sig1}`
        : `https://explorer.solana.com/tx/${sig1}?cluster=${cluster}`;
    console.log(`  Signature: ${sig1}`);
    console.log(`  Explorer:  ${explorer1}`);
    console.log();
  }

  // Step 2: Initialize metadata (if not already created)
  const metadataAccount = await connection.getAccountInfo(metadataPda);
  if (metadataAccount) {
    console.log("Metadata already exists, skipping init_mint_metadata.");
  } else {
    console.log(`Step 2: Initializing metadata (name="${name}", symbol="${symbol}")...`);
    const sig2 = await (program.methods as any)
      .initMintMetadata(name, symbol, uri)
      .accounts({
        pool: poolPda,
        brentMint: mintPda,
        admin: signer.publicKey,
        metadata: metadataPda,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const explorer2 =
      cluster === "mainnet-beta"
        ? `https://explorer.solana.com/tx/${sig2}`
        : `https://explorer.solana.com/tx/${sig2}?cluster=${cluster}`;
    console.log(`  Signature: ${sig2}`);
    console.log(`  Explorer:  ${explorer2}`);
    console.log();
  }

  console.log("Done! Mint and metadata are ready.");
  console.log("You can now use update-metadata.ts to update metadata in the future.");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
