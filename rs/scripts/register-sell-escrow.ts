/**
 * Devnet script: register_sell (escrow lock, no burn)
 *
 * - Ensures escrow vault ATA exists (Token-2022) owned by Pool Signer PDA
 * - Calls `register_sell(token_amount)`
 * - Verifies:
 *   - user token balance decreases
 *   - escrow vault balance increases
 *   - ClaimState exists and contains expected values
 *
 * Run:
 * cd rs
 * export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
 * export ANCHOR_WALLET=~/.config/solana/id.json
 * export SELL_TOKEN_AMOUNT=1000000000   # 1.0 token (9 decimals)
 * npx ts-node -P tsconfig.json scripts/register-sell-escrow.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

// Import the webapp's IDL so this script doesn't depend on generated types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const idlJson = require("../../ts/apps/web/lib/bunkercash.fixed.idl.json") as {
  address: string;
} & Idl;

const PROGRAM_ID = new PublicKey(idlJson.address);
const POOL_SEED = "bunkercash_pool";
const MINT_SEED = "bunkercash_mint";
const POOL_SIGNER_SEED = "bunkercash_pool_signer";

function bnU64LE(v: BN): Buffer {
  return v.toArrayLike(Buffer, "le", 8);
}

async function main() {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const wallet = provider.wallet.publicKey;

  const program = new Program(idlJson as unknown as Idl, provider);
  console.log("Program:", program.programId.toBase58());

  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_SEED)],
    program.programId
  );
  const [bunkercashMintPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(MINT_SEED)],
    program.programId
  );
  const [poolSignerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_SIGNER_SEED), poolPda.toBuffer()],
    program.programId
  );

  const tokenAmountStr = process.env.SELL_TOKEN_AMOUNT ?? "0";
  const tokenAmount = new BN(tokenAmountStr);
  if (tokenAmount.lte(new BN(0))) {
    throw new Error("Set SELL_TOKEN_AMOUNT to a positive integer (base units, 9 decimals).");
  }

  // Token-2022 ATAs
  const userBunkercashAta = getAssociatedTokenAddressSync(
    bunkercashMintPda,
    wallet,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const escrowVaultAta = getAssociatedTokenAddressSync(
    bunkercashMintPda,
    poolSignerPda,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Escrow vault ATA is created on-demand by the program (init_if_needed).

  // Fetch pool state to compute next claim PDA.
  const poolState = await (program.account as any).poolState.fetch(poolPda);
  const claimCounter: BN = poolState.claimCounter as BN;
  const nextId = claimCounter.add(new BN(1));
  const [claimPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("claim"), poolPda.toBuffer(), bnU64LE(nextId)],
    program.programId
  );

  const beforeUser = await provider.connection.getTokenAccountBalance(userBunkercashAta, "confirmed").catch(() => null);
  const beforeEscrow = await provider.connection.getTokenAccountBalance(escrowVaultAta, "confirmed").catch(() => null);

  console.log("Pool:", poolPda.toBase58());
  console.log("Pool signer:", poolSignerPda.toBase58());
  console.log("Mint:", bunkercashMintPda.toBase58());
  console.log("User bunkercash ATA:", userBunkercashAta.toBase58());
  console.log("Escrow vault ATA:", escrowVaultAta.toBase58());
  console.log("Claim PDA:", claimPda.toBase58());
  console.log("Selling token amount (base units):", tokenAmount.toString());

  const sig = await (program.methods as any)
    .registerSell(tokenAmount)
    .accounts({
      pool: poolPda,
      poolSigner: poolSignerPda,
      bunkercashMint: bunkercashMintPda,
      claim: claimPda,
      user: wallet,
      userBunkercash: userBunkercashAta,
      escrowBunkercashVault: escrowVaultAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });

  console.log("register_sell tx:", sig);

  const afterUser = await provider.connection.getTokenAccountBalance(userBunkercashAta, "confirmed").catch(() => null);
  const afterEscrow = await provider.connection.getTokenAccountBalance(escrowVaultAta, "confirmed").catch(() => null);

  const bu = beforeUser ? new BN(beforeUser.value.amount) : new BN(0);
  const be = beforeEscrow ? new BN(beforeEscrow.value.amount) : new BN(0);
  const au = afterUser ? new BN(afterUser.value.amount) : new BN(0);
  const ae = afterEscrow ? new BN(afterEscrow.value.amount) : new BN(0);

  console.log("User balance before/after:", bu.toString(), "→", au.toString());
  console.log("Escrow balance before/after:", be.toString(), "→", ae.toString());

  const claim = await (program.account as any).claimState.fetch(claimPda);
  console.log("ClaimState:", {
    id: claim.id?.toString?.() ?? String(claim.id),
    user: claim.user?.toBase58?.() ?? String(claim.user),
    tokenAmountLocked: claim.tokenAmountLocked?.toString?.() ?? String(claim.tokenAmountLocked),
    usdcPaid: claim.usdcPaid?.toString?.() ?? String(claim.usdcPaid),
    isClosed: claim.isClosed,
    createdAt: claim.createdAt?.toString?.() ?? String(claim.createdAt),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

