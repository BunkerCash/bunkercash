import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Bunkercash } from "../target/types/bunkercash";
import { PublicKey } from "@solana/web3.js";

describe("bunkercash", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Bunkercash as Program<Bunkercash>;
  const wallet = provider.wallet.publicKey;

  it("Is initialized!", async () => {
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool")],
      program.programId
    );

    const tx = await program.methods
      .initialize(wallet)
      .accounts({
        pool: poolPda,
        payer: wallet,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Your transaction signature", tx);
  });
});
