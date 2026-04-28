/**
 * Verifies the full Squads V4 + BunkerCash setup on devnet.
 *
 * Checks:
 *   1. Pool admin on-chain
 *   2. Squads multisig account (members, threshold, txIndex)
 *   3. Vault PDA derivation
 *   4. Whether vault PDA matches pool.admin
 *   5. USDC balances (vault ATA, payout vault)
 *
 * Run:
 *   cd rs
 *   export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
 *   export ANCHOR_WALLET=~/.config/solana/id.json
 *   export SQUADS_MULTISIG_PUBKEY=<your-multisig-pda>
 *   export USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
 *   npx ts-node -P tsconfig.json scripts/verify-squads-setup.ts
 */
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor"
import * as anchor from "@coral-xyz/anchor"
import { PublicKey } from "@solana/web3.js"
import * as multisig from "@sqds/multisig"
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token"

const idlJson = require("../../ts/apps/web/lib/bunkercash.fixed.idl.json") as {
  address: string
} & Idl

const POOL_SEED = "bunkercash_pool"
const POOL_SIGNER_SEED = "bunkercash_pool_signer"

function ok(msg: string) { console.log("  ✅", msg) }
function warn(msg: string) { console.log("  ⚠️ ", msg) }
function err(msg: string) { console.log("  ❌", msg) }
function section(title: string) { console.log(`\n── ${title} ${"─".repeat(50 - title.length)}`) }

async function main() {
  const provider = AnchorProvider.env()
  anchor.setProvider(provider)
  const connection = provider.connection
  const program = new Program(idlJson as unknown as Idl, provider)

  console.log("Cluster  :", connection.rpcEndpoint)
  console.log("Wallet   :", provider.wallet.publicKey.toBase58())

  // ── 1. Pool state ──────────────────────────────────────────────────────────
  section("Pool state")
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_SEED)],
    program.programId,
  )
  const [poolSignerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_SIGNER_SEED), poolPda.toBuffer()],
    program.programId,
  )

  let poolAdmin: PublicKey | null = null
  try {
    const pool = await (program.account as any).poolState.fetch(poolPda)
    poolAdmin = pool.admin as PublicKey
    console.log("  Pool PDA   :", poolPda.toBase58())
    console.log("  Pool admin :", poolAdmin.toBase58())
    console.log("  Pool signer:", poolSignerPda.toBase58())
    console.log("  Price      :", pool.priceUsdcPerToken.toString(), "USDC-base / token")
    console.log("  Claims     :", pool.claimCounter.toString())
  } catch (e) {
    err(`Could not fetch pool state: ${(e as Error).message}`)
    return
  }

  // ── 2. Squads multisig ────────────────────────────────────────────────────
  section("Squads V4 multisig")
  const multisigPdaStr = process.env.SQUADS_MULTISIG_PUBKEY
  if (!multisigPdaStr) {
    err("SQUADS_MULTISIG_PUBKEY env var is not set — export it and re-run")
    return
  }

  let multisigPda: PublicKey
  try {
    multisigPda = new PublicKey(multisigPdaStr)
  } catch {
    err(`Invalid SQUADS_MULTISIG_PUBKEY: ${multisigPdaStr}`)
    return
  }

  console.log("  Multisig PDA:", multisigPda.toBase58())

  let ms: Awaited<ReturnType<typeof multisig.accounts.Multisig.fromAccountAddress>>
  try {
    ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda)
    ok("Multisig account exists on-chain")
  } catch (e) {
    err(`Multisig account NOT found on devnet: ${(e as Error).message}`)
    err("Run: npx ts-node scripts/create-squads-v4-multisig.ts")
    return
  }

  console.log("  Threshold   :", ms.threshold)
  console.log("  Tx index    :", ms.transactionIndex.toString())
  console.log("  Members     :")
  ms.members.forEach((m, i) => {
    console.log(`    [${i}] ${m.key.toBase58()}  mask=${m.permissions.mask}`)
  })

  // ── 3. Vault PDA ──────────────────────────────────────────────────────────
  section("Vault PDA")
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })
  console.log("  Vault PDA (index 0):", vaultPda.toBase58())

  if (poolAdmin && poolAdmin.equals(vaultPda)) {
    ok("pool.admin === vault PDA  ← governance is active")
  } else if (poolAdmin) {
    warn(`pool.admin (${poolAdmin.toBase58()}) does NOT match vault PDA`)
    warn("Run: export NEW_ADMIN_PUBKEY=" + vaultPda.toBase58())
    warn("     npx ts-node scripts/update-admin.ts")
  }

  // ── 4. Wallet membership ──────────────────────────────────────────────────
  section("Wallet membership")
  const walletPk = provider.wallet.publicKey
  const isMember = ms.members.some((m) => m.key.equals(walletPk))
  if (isMember) {
    ok(`${walletPk.toBase58()} IS a member`)
  } else {
    err(`${walletPk.toBase58()} is NOT a member of this multisig`)
    err("You need to connect a member wallet in the browser to propose transactions")
  }

  // ── 5. USDC balances ──────────────────────────────────────────────────────
  section("USDC balances")
  const usdcMintStr = process.env.USDC_MINT
  if (!usdcMintStr) {
    warn("USDC_MINT env var not set — skipping balance check")
    return
  }
  const usdcMint = new PublicKey(usdcMintStr)
  console.log("  USDC mint:", usdcMint.toBase58())

  // Both vaultPda and poolSignerPda are PDAs (off-curve), so allowOwnerOffCurve=true
  const vaultUsdcAta = getAssociatedTokenAddressSync(
    usdcMint, vaultPda, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  )
  const payoutVaultAta = getAssociatedTokenAddressSync(
    usdcMint, poolSignerPda, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  )

  for (const [label, ata] of [
    ["Vault USDC ATA   (source for deposits)", vaultUsdcAta],
    ["Payout vault ATA (source for claims)  ", payoutVaultAta],
  ] as [string, PublicKey][]) {
    const info = await connection.getAccountInfo(ata, "confirmed")
    if (!info) {
      warn(`${label}: NOT INITIALIZED  ${ata.toBase58()}`)
      warn("  → This ATA needs tokens before executing (not just proposing)")
    } else {
      const bal = await connection.getTokenAccountBalance(ata, "confirmed")
      const ui = bal.value.uiAmountString ?? bal.value.amount
      const icon = Number(bal.value.amount) > 0 ? "✅" : "⚠️ "
      console.log(`  ${icon} ${label}: ${ui} USDC  ${ata.toBase58()}`)
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  section("Summary")
  const allGood = poolAdmin?.equals(vaultPda) && isMember
  if (allGood) {
    ok("Setup looks correct — you can propose transactions from the admin panel")
    console.log("\n  Squads app URL:")
    console.log("  https://devnet.squads.so/multisig/" + multisigPda.toBase58())
    console.log("\n  To fund the vault USDC ATA (needed for execution):")
    console.log("  spl-token transfer <USDC_MINT> <AMOUNT> " + vaultUsdcAta.toBase58() + " --url devnet --fund-recipient")
  } else {
    warn("Fix the issues above, then re-run this script")
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
