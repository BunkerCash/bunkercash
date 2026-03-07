import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

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
      "Usage: bun run apps/admin/scripts/update-metadata.ts --name <NAME> --symbol <SYMBOL> --uri <URI> [--rpc <RPC_URL>] [--keypair <PATH>]",
    );
  }

  const rpcUrl =
    args.rpc ??
    process.env.RPC_URL ??
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    "https://api.devnet.solana.com";

  const keypairPath = args.keypair ?? process.env.SOLANA_KEYPAIR ?? "~/.config/solana/id.json";
  const signer = loadKeypair(keypairPath);

  // Use the correct IDL generated from the actual Rust program
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

  const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from("bunkercash_pool")], programId);
  const [mintPda] = PublicKey.findProgramAddressSync([Buffer.from("bunkercash_mint")], programId);
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintPda.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID,
  );

  console.log("Program ID:", programId.toBase58());
  console.log("Pool PDA:", poolPda.toBase58());
  console.log("Mint PDA:", mintPda.toBase58());
  console.log("Metadata PDA:", metadataPda.toBase58());
  console.log("Admin (signer):", signer.publicKey.toBase58());

  const sig = await (program.methods as any)
    .updateMintMetadata(name, symbol, uri)
    .accounts({
      pool: poolPda,
      bunkercashMint: mintPda,
      admin: signer.publicKey,
      metadata: metadataPda,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const cluster = getClusterFromRpc(rpcUrl);
  const explorer =
    cluster === "mainnet-beta"
      ? `https://explorer.solana.com/tx/${sig}`
      : `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;

  console.log("Metadata updated.");
  console.log(`Signature: ${sig}`);
  console.log(`Explorer:  ${explorer}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
