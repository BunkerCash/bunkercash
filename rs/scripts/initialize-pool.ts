import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Bunkercash } from "../target/types/bunkercash";
import { PublicKey } from "@solana/web3.js";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Bunkercash as Program<Bunkercash>;

  console.log("Initializing bRENT pool...");
  console.log("Wallet:", provider.wallet.publicKey.toString());

  // Load config
  const fs = require("fs");
  const config = JSON.parse(
    fs.readFileSync("./scripts/devnet-config.json", "utf8")
  );

  console.log("\nConfiguration:");
  console.log("- Program ID:", config.programId);
  console.log("- bRENT Mint:", config.brentMint);
  console.log("- Pool PDA:", config.poolPda);

  // Master wallet will be the current wallet
  const masterWallet = provider.wallet.publicKey;
  console.log("- Master Wallet:", masterWallet.toString());

  const [poolPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("pool")],
    program.programId
  );

  console.log("\nInitializing pool...");

  try {
    const tx = await program.methods
      .initialize(masterWallet)
      .accounts({
        payer: provider.wallet.publicKey,
      })
      .rpc();

    console.log("Pool initialized successfully!");
    console.log("Transaction signature:", tx);

    // Update config with master wallet
    config.masterWallet = masterWallet.toString();
    config.initialized = true;
    config.initTx = tx;

    fs.writeFileSync(
      "./scripts/devnet-config.json",
      JSON.stringify(config, null, 2)
    );

    console.log("\nConfiguration updated!");
    console.log("\nbRENT is now live on devnet!");
    console.log("\nSummary:");
    console.log("Program ID:", config.programId);
    console.log("bRENT Mint:", config.brentMint);
    console.log("Pool PDA:", config.poolPda);
    console.log("Master Wallet:", config.masterWallet);
    console.log("\nExplorer:");
    console.log(
      `https://explorer.solana.com/address/${config.programId}?cluster=devnet`
    );
  } catch (error) {
    console.error("Error initializing pool:", error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
