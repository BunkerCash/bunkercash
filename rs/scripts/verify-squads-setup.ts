/**
 * Verifies the full Squads V4 + BunkerCash setup on devnet.
 *
 * Checks:
 *   1. Pool admin on-chain
 *   2. Squads multisig account (members, threshold, txIndex)
 *   3. Vault PDA derivation
 *   4. Whether vault PDA matches pool.admin
 *   5. Program upgrade authority
 *   6. USDC balances (vault ATA, payout vault)
 *
 * Run:
 *   cd rs
 *   export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
 *   export ANCHOR_WALLET=~/.config/solana/id.json
 *   export SQUADS_MULTISIG_PUBKEY=<your-multisig-pda>
 *   export SQUADS_PROGRAM_UPGRADE_AUTHORITY=<confirmed-squads-controlled-authority>
 *   export USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
 *   npx ts-node -P tsconfig.json scripts/verify-squads-setup.ts
 */
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  printUpgradeAuthorityStatus,
  verifyProgramUpgradeAuthority,
} from "./governance";

const idlJson = require("../../ts/apps/web/lib/bunkercash.fixed.idl.json") as {
  address: string;
} & Idl;

const POOL_SEED = "bunkercash_pool";
const LEGACY_POOL_SEED = "pool";
const POOL_SIGNER_SEED = "bunkercash_pool_signer";

function ok(msg: string) {
  console.log("  ✅", msg);
}
function warn(msg: string) {
  console.log("  ⚠️ ", msg);
}
function err(msg: string) {
  console.log("  ❌", msg);
}
function section(title: string) {
  console.log(`\n── ${title} ${"─".repeat(50 - title.length)}`);
}

async function fetchPoolGovernance(program: Program<Idl>): Promise<{
  pool: any;
  poolPda: PublicKey;
  poolSignerPda: PublicKey;
  poolAdmin: PublicKey;
}> {
  const connection = (program.provider as AnchorProvider).connection;
  const [fixedPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_SEED)],
    program.programId
  );
  const [fixedPoolSignerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_SIGNER_SEED), fixedPoolPda.toBuffer()],
    program.programId
  );
  if ((program.account as any).poolState) {
    try {
      const pool = await (program.account as any).poolState.fetch(fixedPoolPda);
      return {
        pool,
        poolPda: fixedPoolPda,
        poolSignerPda: fixedPoolSignerPda,
        poolAdmin: pool.admin as PublicKey,
      };
    } catch {
      const info = await connection.getAccountInfo(fixedPoolPda, "confirmed");
      if (info && info.data.length >= 40) {
        return {
          pool: {},
          poolPda: fixedPoolPda,
          poolSignerPda: fixedPoolSignerPda,
          poolAdmin: new PublicKey(info.data.subarray(8, 40)),
        };
      }
    }
  }

  const [legacyPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(LEGACY_POOL_SEED)],
    program.programId
  );
  if ((program.account as any).pool) {
    try {
      const pool = await (program.account as any).pool.fetch(legacyPoolPda);
      return {
        pool,
        poolPda: legacyPoolPda,
        poolSignerPda: legacyPoolPda,
        poolAdmin: pool.masterWallet as PublicKey,
      };
    } catch {
      const info = await connection.getAccountInfo(legacyPoolPda, "confirmed");
      if (info && info.data.length >= 40) {
        return {
          pool: {},
          poolPda: legacyPoolPda,
          poolSignerPda: legacyPoolPda,
          poolAdmin: new PublicKey(info.data.subarray(8, 40)),
        };
      }
    }
  }

  throw new Error("IDL does not expose poolState or pool account clients");
}

async function main() {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const program = new Program(idlJson as unknown as Idl, provider);

  console.log("Cluster  :", connection.rpcEndpoint);
  console.log("Wallet   :", provider.wallet.publicKey.toBase58());

  // ── 1. Pool state ──────────────────────────────────────────────────────────
  section("Pool state");
  let poolAdmin: PublicKey | null = null;
  let poolSignerPda: PublicKey | null = null;
  try {
    const poolGovernance = await fetchPoolGovernance(program);
    const pool = poolGovernance.pool;
    poolAdmin = poolGovernance.poolAdmin;
    poolSignerPda = poolGovernance.poolSignerPda;
    console.log("  Pool PDA   :", poolGovernance.poolPda.toBase58());
    console.log("  Pool admin :", poolAdmin.toBase58());
    console.log("  Pool signer:", poolSignerPda.toBase58());
    if (pool.priceUsdcPerToken) {
      console.log(
        "  Price      :",
        pool.priceUsdcPerToken.toString(),
        "USDC-base / token"
      );
    }
    if (pool.claimCounter) {
      console.log("  Claims     :", pool.claimCounter.toString());
    }
  } catch (e) {
    err(`Could not fetch pool state: ${(e as Error).message}`);
    process.exitCode = 1;
    return;
  }

  // ── 2. Squads multisig ────────────────────────────────────────────────────
  section("Squads V4 multisig");
  const multisigPdaStr = process.env.SQUADS_MULTISIG_PUBKEY;
  if (!multisigPdaStr) {
    err("SQUADS_MULTISIG_PUBKEY env var is not set — export it and re-run");
    process.exitCode = 1;
    return;
  }

  let multisigPda: PublicKey;
  try {
    multisigPda = new PublicKey(multisigPdaStr);
  } catch {
    err(`Invalid SQUADS_MULTISIG_PUBKEY: ${multisigPdaStr}`);
    process.exitCode = 1;
    return;
  }

  console.log("  Multisig PDA:", multisigPda.toBase58());

  let ms: Awaited<
    ReturnType<typeof multisig.accounts.Multisig.fromAccountAddress>
  >;
  try {
    ms = await multisig.accounts.Multisig.fromAccountAddress(
      connection,
      multisigPda
    );
    ok("Multisig account exists on-chain");
  } catch (e) {
    err(`Multisig account NOT found on devnet: ${(e as Error).message}`);
    err("Run: npx ts-node scripts/create-squads-v4-multisig.ts");
    process.exitCode = 1;
    return;
  }

  console.log("  Threshold   :", ms.threshold);
  console.log("  Tx index    :", ms.transactionIndex.toString());
  console.log("  Members     :");
  ms.members.forEach((m, i) => {
    console.log(`    [${i}] ${m.key.toBase58()}  mask=${m.permissions.mask}`);
  });

  // ── 3. Vault PDA ──────────────────────────────────────────────────────────
  section("Vault PDA");
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
  console.log("  Vault PDA (index 0):", vaultPda.toBase58());

  if (poolAdmin && poolAdmin.equals(vaultPda)) {
    ok("pool.admin === vault PDA  ← governance is active");
  } else if (poolAdmin) {
    warn(`pool.admin (${poolAdmin.toBase58()}) does NOT match vault PDA`);
    warn("Run: export NEW_ADMIN_PUBKEY=" + vaultPda.toBase58());
    warn("     npx ts-node scripts/update-admin.ts");
  }

  // ── 4. Wallet membership ──────────────────────────────────────────────────
  section("Wallet membership");
  const walletPk = provider.wallet.publicKey;
  const isMember = ms.members.some((m) => m.key.equals(walletPk));
  if (isMember) {
    ok(`${walletPk.toBase58()} IS a member`);
  } else {
    err(`${walletPk.toBase58()} is NOT a member of this multisig`);
    err(
      "You need to connect a member wallet in the browser to propose transactions"
    );
  }

  // ── 5. Program upgrade authority ──────────────────────────────────────────
  section("Program upgrade authority");
  let upgradeAuthorityOk = false;
  try {
    const status = await verifyProgramUpgradeAuthority({
      provider,
      programId: program.programId,
      deployerWallet: provider.wallet.publicKey,
    });
    printUpgradeAuthorityStatus(status);
    ok("program upgrade authority is verified");
    console.log("  CLI check:");
    console.log("  solana program show " + program.programId.toBase58());
    upgradeAuthorityOk = true;
  } catch (e) {
    err((e as Error).message);
    err("Do not bootstrap or fund mainnet until this passes");
  }

  // ── 6. USDC balances ──────────────────────────────────────────────────────
  section("USDC balances");
  const usdcMintStr = process.env.USDC_MINT;
  let vaultUsdcAta: PublicKey | null = null;
  if (!usdcMintStr) {
    warn("USDC_MINT env var not set — skipping balance check");
  } else {
    const usdcMint = new PublicKey(usdcMintStr);
    console.log("  USDC mint:", usdcMint.toBase58());

    // Both vaultPda and poolSignerPda are PDAs (off-curve), so allowOwnerOffCurve=true
    vaultUsdcAta = getAssociatedTokenAddressSync(
      usdcMint,
      vaultPda,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const payoutVaultAta = getAssociatedTokenAddressSync(
      usdcMint,
      poolSignerPda!,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    for (const [label, ata] of [
      ["Vault USDC ATA   (source for deposits)", vaultUsdcAta],
      ["Payout vault ATA (source for claims)  ", payoutVaultAta],
    ] as [string, PublicKey][]) {
      const info = await connection.getAccountInfo(ata, "confirmed");
      if (!info) {
        warn(`${label}: NOT INITIALIZED  ${ata.toBase58()}`);
        warn("  → This ATA needs tokens before executing (not just proposing)");
      } else {
        const bal = await connection.getTokenAccountBalance(ata, "confirmed");
        const ui = bal.value.uiAmountString ?? bal.value.amount;
        const icon = Number(bal.value.amount) > 0 ? "✅" : "⚠️ ";
        console.log(`  ${icon} ${label}: ${ui} USDC  ${ata.toBase58()}`);
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  section("Summary");
  const allGood = poolAdmin?.equals(vaultPda) && isMember && upgradeAuthorityOk;
  if (allGood) {
    ok(
      "Setup looks correct — you can propose transactions from the admin panel"
    );
    console.log("\n  Squads app URL:");
    console.log(
      "  https://devnet.squads.so/multisig/" + multisigPda.toBase58()
    );
    if (vaultUsdcAta) {
      console.log("\n  To fund the vault USDC ATA (needed for execution):");
      console.log(
        "  spl-token transfer <USDC_MINT> <AMOUNT> " +
          vaultUsdcAta.toBase58() +
          " --url devnet --fund-recipient"
      );
    }
  } else {
    warn("Fix the issues above, then re-run this script");
    if (vaultUsdcAta && !upgradeAuthorityOk) {
      warn(
        "Funding command withheld until program upgrade authority is verified"
      );
    }
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
