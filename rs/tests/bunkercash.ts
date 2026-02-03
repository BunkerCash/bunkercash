/**
 * CLI tests for the BunkerCash fixed-price program.
 *
 * Uses the same IDL as the web app (bunkercash.fixed.idl.json) so tests match
 * the deployed program (initialize, buy_primary, update_price, register_sell).
 *
 * Run from repo root:
 *   cd rs && anchor test
 *
 * Or run only this file:
 *   cd rs && yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/bunkercash.ts
 *
 * Requires: ANCHOR_PROVIDER_URL, ANCHOR_WALLET (keypair with SOL on devnet).
 */
import * as anchor from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import BN from "bn.js";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { createRequire } from "node:module";

// Use the web app's fixed IDL so tests match the current program (bunkercash_pool, initialize, buy_primary, etc.)
const require = createRequire(import.meta.url);
const idlJson = require("../../ts/apps/web/lib/bunkercash.fixed.idl.json") as {
  address: string;
} & Idl;

const PROGRAM_ID = new PublicKey(idlJson.address);
const POOL_SEED = "bunkercash_pool";
const MINT_SEED = "bunkercash_mint";

describe("bunkercash", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new anchor.Program(idlJson as unknown as Idl, provider);
  const wallet = provider.wallet.publicKey;

  it("initializes the pool and Bunker Cash mint (or skips if already initialized)", async () => {
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(POOL_SEED)],
      program.programId
    );
    const [bunkercashMintPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(MINT_SEED)],
      program.programId
    );

    const poolInfo = await provider.connection.getAccountInfo(poolPda, "confirmed");
    if (!poolInfo) {
      const priceUsdcPerToken = new BN(1_000_000); // 1 USDC per 1 token (6 decimals)
      const tx = await (program.methods as any)
        .initialize(wallet, priceUsdcPerToken)
        .accounts({
          pool: poolPda,
          bunkercashMint: bunkercashMintPda,
          payer: wallet,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("initialize tx:", tx);
    } else {
      console.log("Pool already initialized; skipping.");
    }
  });
});
