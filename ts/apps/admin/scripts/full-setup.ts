import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { AnchorProvider, Program, BN, type Idl } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

function expandHome(path: string): string {
  return path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path;
}

function loadKeypair(path: string): Keypair {
  const file = readFileSync(expandHome(path), "utf8");
  const secret = Uint8Array.from(JSON.parse(file) as number[]);
  return Keypair.fromSecretKey(secret);
}

async function main() {
  const rpcUrl = process.env.RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const signer = loadKeypair("~/.config/solana/id.json");

  const idlRaw = readFileSync(resolve(process.cwd(), "../rs/target/idl/bunkercash.json"), "utf8");
  const idlJson = JSON.parse(idlRaw) as Idl & { address: string };
  const programId = new PublicKey(idlJson.address);

  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = {
    publicKey: signer.publicKey,
    signTransaction: async (tx: any) => { tx.partialSign?.(signer) ?? tx.sign?.(signer); return tx; },
    signAllTransactions: async (txs: any[]) => txs.map((tx) => { tx.partialSign?.(signer) ?? tx.sign?.(signer); return tx; }),
  };

  const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
  const program = new Program(idlJson as Idl, provider);

  const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from("bunkercash_pool")], programId);
  const [mintPda] = PublicKey.findProgramAddressSync([Buffer.from("bunkercash_mint")], programId);
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintPda.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID,
  );

  console.log("Program:", programId.toBase58());
  console.log("Pool PDA:", poolPda.toBase58());
  console.log("Mint PDA:", mintPda.toBase58());
  console.log("Metadata PDA:", metadataPda.toBase58());
  console.log("Admin:", signer.publicKey.toBase58());
  console.log();

  // Step 1: Initialize pool + mint
  const poolAccount = await connection.getAccountInfo(poolPda);
  if (poolAccount) {
    console.log("Pool already initialized, skipping.");
  } else {
    console.log("Step 1: Initializing pool + mint...");
    // price = 1 USDC per token = 1_000_000 base units
    const sig = await (program.methods as any)
      .initialize(signer.publicKey, new BN(1_000_000))
      .accounts({
        pool: poolPda,
        bunkercashMint: mintPda,
        payer: signer.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("  Tx:", sig);
    console.log();
  }

  // Step 2: Init metadata
  const metadataAccount = await connection.getAccountInfo(metadataPda);
  if (metadataAccount) {
    console.log("Metadata already exists, skipping.");
  } else {
    console.log("Step 2: Creating metadata...");
    const sig = await (program.methods as any)
      .initMintMetadata("Bunker Cash", "BNKR", "https://bunkercash.com/metadata.json")
      .accounts({
        pool: poolPda,
        bunkercashMint: mintPda,
        admin: signer.publicKey,
        metadata: metadataPda,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("  Tx:", sig);
    console.log();
  }

  console.log("Done! Program fully set up.");
  console.log(`Mint: ${mintPda.toBase58()}`);
  console.log(`Explorer: https://explorer.solana.com/address/${mintPda.toBase58()}?cluster=devnet`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
