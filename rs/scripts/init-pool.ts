import * as anchor from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

const idlJson = require("../target/idl/bunkercash.json") as { address: string } & Idl;

const PROGRAM_ID = new PublicKey(idlJson.address);
const MASTER_WALLET = new PublicKey(
  process.env.MASTER_WALLET_PUBKEY ??
    "Hmod5q5Egi1yqiRCAAgZBh1iD8o8kALVQV8WKBM84JhK"
);
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ?? "Fr1JKnAfaspPUpsQBsYPfKmMak5tL6VXixibKJX5roJx"
);

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new anchor.Program(idlJson as unknown as Idl, provider);
  const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from("pool")], PROGRAM_ID);
  const poolUsdc = getAssociatedTokenAddressSync(
    USDC_MINT,
    poolPda,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const existing = await provider.connection.getAccountInfo(poolPda, "confirmed");
  if (existing) {
    console.log("Pool already exists:", poolPda.toBase58());
    return;
  }

  const signature = await (program.methods as any)
    .initialize(MASTER_WALLET)
    .accounts({
      pool: poolPda,
      usdcMint: USDC_MINT,
      poolUsdc,
      payer: provider.wallet.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("Program ID:", PROGRAM_ID.toBase58());
  console.log("Pool PDA:", poolPda.toBase58());
  console.log("Master wallet:", MASTER_WALLET.toBase58());
  console.log("USDC mint:", USDC_MINT.toBase58());
  console.log("Pool USDC vault:", poolUsdc.toBase58());
  console.log("Initialize tx:", signature);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
