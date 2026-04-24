/**
 * Bootstrap the fixed-price BunkerCash pool on devnet.
 *
 * - Creates the `PoolState` PDA
 * - Creates the Token-2022 BunkerCash mint PDA (mint authority = pool PDA)
 * - Creates required ATAs (user USDC, pool USDC vault, user BunkerCash)
 * - Optionally runs a test `buy_primary`
 *
 * Run:
 * cd rs
 * export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
 * export ANCHOR_WALLET=~/.config/solana/id.json
 * npx ts-node -P tsconfig.json scripts/bootstrap-fixed-price.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
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

function requireUsdcMint(): PublicKey {
  const mint = process.env.USDC_MINT;
  if (!mint) {
    throw new Error("USDC_MINT must be set explicitly before running bootstrap-fixed-price.ts.");
  }
  return new PublicKey(mint);
}

async function ensureAta(params: {
  provider: AnchorProvider;
  payer: anchor.web3.Keypair;
  mint: PublicKey;
  owner: PublicKey;
  allowOwnerOffCurve: boolean;
  tokenProgram: PublicKey;
}): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(
    params.mint,
    params.owner,
    params.allowOwnerOffCurve,
    params.tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const info = await params.provider.connection.getAccountInfo(ata, "confirmed");
  if (info) return ata;

  const ix = createAssociatedTokenAccountIdempotentInstruction(
    params.payer.publicKey,
    ata,
    params.owner,
    params.mint,
    params.tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const tx = new anchor.web3.Transaction().add(ix);
  await anchor.web3.sendAndConfirmTransaction(
    params.provider.connection,
    tx,
    [params.payer],
    { commitment: "confirmed" }
  );

  return ata;
}

async function main() {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  const usdcMint = requireUsdcMint();

  const payer = (provider.wallet as any).payer as anchor.web3.Keypair;
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

  console.log("Pool PDA:", poolPda.toBase58());
  console.log("Pool signer PDA:", poolSignerPda.toBase58());
  console.log("BunkerCash mint PDA:", bunkercashMintPda.toBase58());
  console.log("USDC mint:", usdcMint.toBase58());

  // Admin: use ADMIN_PUBKEY env (e.g. your Phantom address) if set; otherwise wallet that runs this script.
  const adminPubkey = process.env.ADMIN_PUBKEY
    ? new PublicKey(process.env.ADMIN_PUBKEY)
    : wallet;
  console.log("Admin (pool admin):", adminPubkey.toBase58());

  // Initialize pool + mint if not already initialized.
  const poolInfo = await provider.connection.getAccountInfo(poolPda, "confirmed");
  if (!poolInfo) {
    const priceUsdcPerToken = new BN(1_000_000); // 1 USDC per 1 token (USDC has 6 decimals)
    const initSig = await (program.methods as any)
      .initialize(adminPubkey, priceUsdcPerToken)
      .accounts({
        pool: poolPda,
        bunkercashMint: bunkercashMintPda,
        payer: wallet,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });

    console.log("initialize tx:", initSig);
  } else {
    console.log("Pool already initialized; skipping initialize.");
  }

  // Create ATAs needed for buys/sells.
  const userUsdcAta = await ensureAta({
    provider,
    payer,
    mint: usdcMint,
    owner: wallet,
    allowOwnerOffCurve: false,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const payoutUsdcVaultAta = await ensureAta({
    provider,
    payer,
    mint: usdcMint,
    owner: poolSignerPda,
    allowOwnerOffCurve: true,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const userBunkercashAta = await ensureAta({
    provider,
    payer,
    mint: bunkercashMintPda,
    owner: wallet,
    allowOwnerOffCurve: false,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  });

  console.log("User USDC ATA:", userUsdcAta.toBase58());
  console.log("Payout USDC vault ATA (Pool Signer):", payoutUsdcVaultAta.toBase58());
  console.log("User BunkerCash ATA:", userBunkercashAta.toBase58());

  // Optional test buy (set TEST_BUY_USDC=2.5 to buy 2.5 USDC worth).
  if (process.env.TEST_BUY_USDC) {
    const v = Number(process.env.TEST_BUY_USDC);
    if (!Number.isFinite(v) || v <= 0) throw new Error("Invalid TEST_BUY_USDC");
    const usdcAmount = new BN(Math.round(v * 1_000_000));

    // Preflight: ensure wallet has enough devnet USDC in the ATA.
    const balResp = await provider.connection.getTokenAccountBalance(
      userUsdcAta,
      "confirmed"
    );
    const bal = new BN(balResp.value.amount);
    if (bal.lt(usdcAmount)) {
      const have = Number(bal.toString()) / 1_000_000;
      const need = Number(usdcAmount.toString()) / 1_000_000;
      console.error(
        `Insufficient devnet USDC for test buy. Have ${have} USDC, need ${need} USDC.`
      );
      console.error("Fund this wallet on devnet, then re-run:");
      console.error("  Wallet:", wallet.toBase58());
      console.error("  USDC mint:", usdcMint.toBase58());
      console.error("  USDC ATA:", userUsdcAta.toBase58());
      process.exitCode = 1;
      return;
    }

    const sig = await (program.methods as any)
      .buyPrimary(usdcAmount)
      .accounts({
        pool: poolPda,
        poolSigner: poolSignerPda,
        bunkercashMint: bunkercashMintPda,
        user: wallet,
        usdcMint,
        userUsdc: userUsdcAta,
        payoutUsdcVault: payoutUsdcVaultAta,
        userBunkercash: userBunkercashAta,
        usdcTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });

    console.log("buy_primary tx:", sig);
  } else {
    console.log("Skipping test buy. Set TEST_BUY_USDC=2.5 to run one.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
