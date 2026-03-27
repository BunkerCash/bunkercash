import * as anchor from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

const idlJson = require("../target/idl/bunkercash.json") as { address: string } & Idl;

const PROGRAM_ID = new PublicKey(idlJson.address);
const SUPPORTED_USDC_CONFIG_SEED = Buffer.from("supported_usdc_config");
const MASTER_WALLET = new PublicKey(
  process.env.MASTER_WALLET_PUBKEY ??
    process.env.ADMIN_PUBKEY ??
    "Hmod5q5Egi1yqiRCAAgZBh1iD8o8kALVQV8WKBM84JhK"
);
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ?? "Fr1JKnAfaspPUpsQBsYPfKmMak5tL6VXixibKJX5roJx"
);

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new anchor.Program(idlJson as unknown as Idl, provider);
  const mintInfo = await provider.connection.getAccountInfo(USDC_MINT, "confirmed");
  const usdcTokenProgram = mintInfo?.owner;
  if (!usdcTokenProgram) {
    throw new Error(`Unable to load mint owner for ${USDC_MINT.toBase58()}`);
  }
  const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from("pool")], PROGRAM_ID);
  const [supportedUsdcConfigPda] = PublicKey.findProgramAddressSync(
    [SUPPORTED_USDC_CONFIG_SEED],
    PROGRAM_ID
  );
  const poolUsdc = getAssociatedTokenAddressSync(
    USDC_MINT,
    poolPda,
    true,
    usdcTokenProgram,
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
      supportedUsdcConfig: supportedUsdcConfigPda,
      payer: provider.wallet.publicKey,
      usdcTokenProgram,
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
