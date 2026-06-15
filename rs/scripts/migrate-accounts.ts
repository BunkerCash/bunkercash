// Migrates on-chain accounts from pre-epoch layouts to the current layouts
// after a program upgrade:
//   - Pool: 81 -> 89 bytes (adds settlement_epoch_seq)
//   - Claim: 83/91 -> 99 bytes (adds last_settled_epoch_seq + last_paid_epoch_seq)
//
// Run this BEFORE re-enabling settlement flows in an upgraded environment.
// The provider wallet must be the pool's master wallet for the pool
// migration (claim migrations are permissionless; the wallet just pays the
// realloc rent). The on-chain program refuses to migrate while a settlement
// epoch is open, and this script checks the same thing up front.
//
// Usage:
//   ANCHOR_PROVIDER_URL=... ANCHOR_WALLET=... npx ts-node -P tsconfig.json scripts/migrate-accounts.ts
//   DRY_RUN=true ...   # only report what would be migrated

import * as anchor from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

const idlJson = require("../target/idl/bunkercash.json") as { address: string } & Idl;

const PROGRAM_ID = new PublicKey(idlJson.address);
const POOL_SEED = Buffer.from("pool");
const SETTLEMENT_SEED = Buffer.from("settlement");

const CURRENT_POOL_SIZE = 89;
const LEGACY_POOL_SIZE = 81;
const CURRENT_CLAIM_SIZE = 99;
const LEGACY_CLAIM_SIZES = [83, 91];

const DRY_RUN = process.env.DRY_RUN === "true";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const program = new anchor.Program(idlJson as unknown as Idl, provider);
  const wallet = provider.wallet.publicKey;

  const [poolPda] = PublicKey.findProgramAddressSync([POOL_SEED], PROGRAM_ID);
  const [settlementPda] = PublicKey.findProgramAddressSync(
    [SETTLEMENT_SEED, poolPda.toBuffer()],
    PROGRAM_ID
  );

  console.log(`Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`Pool PDA: ${poolPda.toBase58()}`);
  console.log(`Wallet:   ${wallet.toBase58()}`);
  if (DRY_RUN) console.log("DRY_RUN=true — no transactions will be sent");

  const settlementInfo = await connection.getAccountInfo(settlementPda, "confirmed");
  if (settlementInfo && settlementInfo.data.length > 0) {
    throw new Error(
      "A settlement epoch is open; close it before migrating accounts. " +
        "The program enforces this on chain as well."
    );
  }

  // ---- Pool ----
  const poolInfo = await connection.getAccountInfo(poolPda, "confirmed");
  if (!poolInfo) {
    throw new Error("Pool account not found; nothing to migrate.");
  }
  if (poolInfo.data.length === CURRENT_POOL_SIZE) {
    console.log("Pool already uses the current layout.");
  } else if (poolInfo.data.length === LEGACY_POOL_SIZE) {
    console.log(`Pool uses legacy layout (${poolInfo.data.length} bytes); migrating...`);
    if (!DRY_RUN) {
      const sig = await program.methods
        .migratePool()
        .accounts({
          pool: poolPda,
          settlementCheck: settlementPda,
          admin: wallet,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(`  migrated pool: ${sig}`);
    }
  } else {
    throw new Error(
      `Pool account has unexpected size ${poolInfo.data.length}; refusing to continue.`
    );
  }

  // ---- Claims ----
  let migrated = 0;
  let failed = 0;
  for (const dataSize of LEGACY_CLAIM_SIZES) {
    const legacyClaims = await connection.getProgramAccounts(PROGRAM_ID, {
      commitment: "confirmed",
      filters: [{ dataSize }],
    });
    console.log(`Found ${legacyClaims.length} claim account(s) with legacy size ${dataSize}.`);

    for (const { pubkey } of legacyClaims) {
      if (DRY_RUN) {
        console.log(`  would migrate claim ${pubkey.toBase58()}`);
        continue;
      }
      try {
        const sig = await program.methods
          .migrateClaim()
          .accounts({
            pool: poolPda,
            claim: pubkey,
            settlementCheck: settlementPda,
            payer: wallet,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        migrated += 1;
        console.log(`  migrated claim ${pubkey.toBase58()}: ${sig}`);
      } catch (err) {
        failed += 1;
        console.error(`  FAILED to migrate claim ${pubkey.toBase58()}:`, err);
      }
    }
  }

  if (DRY_RUN) {
    console.log("Dry run complete.");
    return;
  }

  // ---- Verify ----
  for (const dataSize of LEGACY_CLAIM_SIZES) {
    const remaining = await connection.getProgramAccounts(PROGRAM_ID, {
      commitment: "confirmed",
      filters: [{ dataSize }],
    });
    if (remaining.length > 0) {
      console.warn(
        `WARNING: ${remaining.length} claim(s) still on legacy size ${dataSize}; re-run the script.`
      );
    }
  }
  const currentClaims = await connection.getProgramAccounts(PROGRAM_ID, {
    commitment: "confirmed",
    filters: [{ dataSize: CURRENT_CLAIM_SIZE }],
  });
  console.log(
    `Done. Migrated ${migrated} claim(s), ${failed} failure(s); ` +
      `${currentClaims.length} claim(s) now use the current layout.`
  );
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
