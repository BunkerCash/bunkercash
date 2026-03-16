import * as anchor from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

const idlJson = require("../target/idl/bunkercash.json") as { address: string } & Idl;

const PROGRAM_ID = new PublicKey(idlJson.address);

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new anchor.Program(idlJson as unknown as Idl, provider);
  const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from("pool")], PROGRAM_ID);
  const [mintPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bunkercash_mint")],
    PROGRAM_ID,
  );

  const existing = await provider.connection.getAccountInfo(mintPda, "confirmed");
  if (existing) {
    console.log("Bunker Cash mint already exists:", mintPda.toBase58());
    return;
  }

  const signature = await (program.methods as any)
    .createBrentMint()
    .accounts({
      pool: poolPda,
      brentMint: mintPda,
      admin: provider.wallet.publicKey,
      tokenProgram: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("Program ID:", PROGRAM_ID.toBase58());
  console.log("Pool PDA:", poolPda.toBase58());
  console.log("Mint PDA:", mintPda.toBase58());
  console.log("Create mint tx:", signature);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
