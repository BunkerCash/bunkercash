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
 *   cd rs && npx ts-mocha -p ./tsconfig.json -t 1000000 tests/bunkercash.ts
 *
 * Localnet creates a temporary 6-decimal test mint when USDC_MINT is omitted.
 * Non-local clusters require USDC_MINT to be set explicitly.
 */
import * as anchor from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
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
const PURCHASE_LIMIT_SEED = "purchase_limit";
const SUPPORTED_USDC_CONFIG_SEED = "supported_usdc_config";

type ProgramMethod = {
  accounts(accounts: Record<string, PublicKey>): {
    rpc(): Promise<string>;
  };
};
type ProgramMethods = Record<string, (...args: unknown[]) => ProgramMethod>;

function isLocalProviderUrl(rpcEndpoint: string): boolean {
  return rpcEndpoint.includes("127.0.0.1") || rpcEndpoint.includes("localhost");
}

async function confirmAirdrop(
  connection: anchor.web3.Connection,
  signature: string
) {
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction(
    {
      signature,
      ...latestBlockhash,
    },
    "confirmed"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getAccountInfoWithRetry(
  connection: anchor.web3.Connection,
  pubkey: PublicKey
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const accountInfo =
      (await connection.getAccountInfo(pubkey, "confirmed")) ??
      (await connection.getAccountInfo(pubkey, "processed"));
    if (accountInfo) {
      return accountInfo;
    }
    await sleep(100);
  }

  return null;
}

async function resolveUsdcMint(
  provider: anchor.AnchorProvider
): Promise<PublicKey> {
  const mint = process.env.USDC_MINT;
  if (mint) {
    return new PublicKey(mint);
  }

  if (!isLocalProviderUrl(provider.connection.rpcEndpoint)) {
    throw new Error(
      "USDC_MINT must be set explicitly for non-local test runs."
    );
  }

  const payer = Keypair.generate();
  await confirmAirdrop(
    provider.connection,
    await provider.connection.requestAirdrop(
      payer.publicKey,
      2 * LAMPORTS_PER_SOL
    )
  );

  return createMint(provider.connection, payer, payer.publicKey, null, 6);
}

describe("bunkercash", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new anchor.Program(idlJson as unknown as Idl, provider);
  const methods = program.methods as unknown as ProgramMethods;
  const wallet = provider.wallet.publicKey;
  let usdcMint: PublicKey;

  before(async () => {
    usdcMint = await resolveUsdcMint(provider);
  });

  it("rejects unauthorized pool initialization (or skips if already initialized)", async () => {
    const mintInfo = await getAccountInfoWithRetry(
      provider.connection,
      usdcMint
    );
    const usdcTokenProgram = mintInfo?.owner;
    if (!usdcTokenProgram) {
      throw new Error(`Unable to load mint owner for ${usdcMint.toBase58()}`);
    }
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(POOL_SEED)],
      program.programId
    );
    const [supportedUsdcConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SUPPORTED_USDC_CONFIG_SEED)],
      program.programId
    );
    const [purchaseLimitConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(PURCHASE_LIMIT_SEED)],
      program.programId
    );
    const poolUsdc = getAssociatedTokenAddressSync(
      usdcMint,
      poolPda,
      true,
      usdcTokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const poolInfo = await provider.connection.getAccountInfo(
      poolPda,
      "confirmed"
    );
    if (!poolInfo) {
      try {
        await methods
          .initialize(wallet)
          .accounts({
            pool: poolPda,
            usdcMint,
            poolUsdc,
            supportedUsdcConfig: supportedUsdcConfigPda,
            purchaseLimitConfig: purchaseLimitConfigPda,
            bootstrapAuthority: wallet,
            payer: wallet,
            usdcTokenProgram,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Unauthorized")) {
          return;
        }
        throw error;
      }

      throw new Error("Expected initialize to reject a non-bootstrap wallet");
    } else {
      console.log("Pool already initialized; skipping.");
    }
  });
});
