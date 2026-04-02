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
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { createRequire } from "node:module";

// Use the web app's fixed IDL so tests match the current program (bunkercash_pool, initialize, buy_primary, etc.)
const require = createRequire(import.meta.url);
const idlJson = require("../../ts/apps/web/lib/bunkercash.fixed.idl.json") as {
  address: string;
} & Idl;

const PROGRAM_ID = new PublicKey(idlJson.address);
const POOL_SEED = "pool";
const SUPPORTED_USDC_CONFIG_SEED = "supported_usdc_config";
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ?? "Fr1JKnAfaspPUpsQBsYPfKmMak5tL6VXixibKJX5roJx"
);

describe("bunkercash", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new anchor.Program(idlJson as unknown as Idl, provider);
  const wallet = provider.wallet.publicKey;

  it("initializes the pool (or skips if already initialized)", async () => {
    const mintInfo = await provider.connection.getAccountInfo(USDC_MINT, "confirmed");
    const usdcTokenProgram = mintInfo?.owner;
    if (!usdcTokenProgram) {
      throw new Error(`Unable to load mint owner for ${USDC_MINT.toBase58()}`);
    }
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(POOL_SEED)],
      program.programId
    );
    const [supportedUsdcConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SUPPORTED_USDC_CONFIG_SEED)],
      program.programId
    );
    const poolUsdc = getAssociatedTokenAddressSync(
      USDC_MINT,
      poolPda,
      true,
      usdcTokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const poolInfo = await provider.connection.getAccountInfo(poolPda, "confirmed");
    if (!poolInfo) {
      const tx = await (program.methods as any)
        .initialize(wallet)
        .accounts({
          pool: poolPda,
          usdcMint: USDC_MINT,
          poolUsdc,
          supportedUsdcConfig: supportedUsdcConfigPda,
          payer: wallet,
          usdcTokenProgram,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("initialize tx:", tx);
    } else {
      console.log("Pool already initialized; skipping.");
    }
  });
});
