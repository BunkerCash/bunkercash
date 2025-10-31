import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Bunkercash } from "../target/types/bunkercash";
import {
  createMint,
  TOKEN_2022_PROGRAM_ID,
  getMintLen,
  ExtensionType,
} from "@solana/spl-token";
import {
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createInitializeTransferFeeConfigInstruction,
  createInitializeMintInstruction,
} from "@solana/spl-token";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Bunkercash as Program<Bunkercash>;

  console.log("Setting up bRENT mint with Token-2022...");
  console.log("Wallet:", provider.wallet.publicKey.toString());

  // Generate keypair for the mint
  const mintKeypair = Keypair.generate();
  console.log("bRENT Mint:", mintKeypair.publicKey.toString());

  // 0.25% = 25 basis points
  const feeBasisPoints = 25;
  const maxFee = BigInt(10_000_000_000); // 10,000 USDC max fee (6 decimals)

  // Calculate space needed for mint with transfer fee extension
  const extensions = [ExtensionType.TransferFeeConfig];
  const mintLen = getMintLen(extensions);

  console.log("\nMint configuration:");
  console.log("- Transfer fee: 0.25% (25 basis points)");
  console.log("- Max fee:", maxFee.toString());
  console.log("- Decimals: 6");
  console.log("- Mint authority: Pool PDA");

  // Find pool PDA
  const [poolPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("pool")],
    program.programId
  );

  console.log("- Pool PDA (will be mint authority):", poolPda.toString());

  // Calculate rent
  const lamports = await provider.connection.getMinimumBalanceForRentExemption(
    mintLen
  );

  console.log("\nCreating mint account and initializing transfer fee...");

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferFeeConfigInstruction(
      mintKeypair.publicKey,
      provider.wallet.publicKey, // transfer fee config authority
      provider.wallet.publicKey, // withdraw withheld authority
      feeBasisPoints,
      maxFee,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      6, // decimals
      poolPda, // mint authority (pool PDA)
      null, // freeze authority (none)
      TOKEN_2022_PROGRAM_ID
    )
  );

  const signature = await sendAndConfirmTransaction(
    provider.connection,
    transaction,
    [provider.wallet.payer, mintKeypair],
    { commitment: "confirmed" }
  );

  console.log("\nbRENT mint created successfully!");
  console.log("Signature:", signature);
  console.log("\nSave these addresses:");
  console.log("bRENT Mint:", mintKeypair.publicKey.toString());
  console.log("Pool PDA:", poolPda.toString());
  console.log("Program ID:", program.programId.toString());

  // Save to a JSON file for later use
  const config = {
    brentMint: mintKeypair.publicKey.toString(),
    poolPda: poolPda.toString(),
    programId: program.programId.toString(),
    network: "devnet",
  };

  const fs = require("fs");
  fs.writeFileSync(
    "./scripts/devnet-config.json",
    JSON.stringify(config, null, 2)
  );
  console.log("\nConfiguration saved to ./scripts/devnet-config.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
