/**
 * E2E devnet flow:
 * - print available program instructions (from IDL)
 * - print pool + user balances (USDC + BNKR + escrow)
 * - run buy_primary (USDC -> BNKR)
 * - print balances
 * - run register_sell (lock BNKR -> escrow, no burn)
 * - print balances + ClaimState
 *
 * Run (recommended):
 * cd rs
 * source scripts/devnet.env.example.sh
 * export BUY_USDC=1
 * export SELL_BNKR=0.1
 * npm run -s e2e
 *
 * Or:
 * anchor run e2e
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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const idlJson = require("../../ts/apps/web/lib/bunkercash.fixed.idl.json") as {
  address: string;
} & Idl;

const PROGRAM_ID = new PublicKey(idlJson.address);
const POOL_SEED = "bunkercash_pool";
const MINT_SEED = "bunkercash_mint";
const POOL_SIGNER_SEED = "bunkercash_pool_signer";
const CLAIM_PRICE_SNAPSHOT_SEED = "bunkercash_claim_price_snapshot";

const USDC_DECIMALS = 6;
const BNKR_DECIMALS = 9;

function uiToBaseUnits(uiAmount: string, decimals: number): BN {
  const s = uiAmount.trim();
  if (!s) throw new Error("empty amount");
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`invalid amount: "${uiAmount}"`);
  const [head, tailRaw = ""] = s.split(".");
  const tail = tailRaw.padEnd(decimals, "0").slice(0, decimals);
  const raw = `${head}${tail}`.replace(/^0+/, "") || "0";
  return new BN(raw);
}

function bnU64LE(v: BN): Buffer {
  return v.toArrayLike(Buffer, "le", 8);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errText(e: unknown): string {
  if (e && typeof e === "object") {
    const anyE = e as any;
    return (
      anyE.transactionMessage ??
      anyE.message ??
      anyE.toString?.() ??
      String(e)
    );
  }
  return String(e);
}

async function rpcWithBlockhashRetry<T>(
  label: string,
  fn: () => Promise<T>,
  retries = 4
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = errText(e);
      const isBlockhash = /blockhash not found/i.test(msg); // ddint like the solution from ai. 
      if (!isBlockhash || attempt === retries) throw e;
      console.warn(`${label}: Blockhash not found, retrying (${attempt}/${retries})...`);
      // small backoff helps devnet RPC consistency
      await sleep(600 * attempt);
    }
  }
  // should be unreachable
  throw lastErr;
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
  await anchor.web3.sendAndConfirmTransaction(params.provider.connection, tx, [params.payer], {
    commitment: "confirmed",
  });
  return ata;
}

async function tokenBalRaw(provider: AnchorProvider, tokenAccount: PublicKey): Promise<BN | null> {
  const info = await provider.connection.getAccountInfo(tokenAccount, "confirmed");
  if (!info) return null;
  const bal = await provider.connection.getTokenAccountBalance(tokenAccount, "confirmed");
  return new BN(bal.value.amount);
}

function formatUnits(raw: BN, decimals: number): string {
  const s = raw.toString(10).padStart(decimals + 1, "0");
  const head = s.slice(0, -decimals);
  const tail = s.slice(-decimals).replace(/0+$/, "");
  return tail.length ? `${head}.${tail}` : head;
}

async function printSnapshot(params: {
  provider: AnchorProvider;
  program: Program<Idl>;
  poolPda: PublicKey;
  bunkercashMintPda: PublicKey;
  poolSignerPda: PublicKey;
  usdcMint: PublicKey;
  userUsdcAta: PublicKey;
  payoutUsdcVaultAta: PublicKey;
  userBnkrAta: PublicKey;
  escrowBnkrVaultAta: PublicKey;
}) {
  const {
    provider,
    program,
    poolPda,
    bunkercashMintPda,
    poolSignerPda,
    usdcMint,
    userUsdcAta,
    payoutUsdcVaultAta,
    userBnkrAta,
    escrowBnkrVaultAta,
  } = params;

  console.log("\n=== Snapshot ===");
  console.log("Cluster:", provider.connection.rpcEndpoint);
  console.log("Program:", program.programId.toBase58());
  console.log("Pool PDA:", poolPda.toBase58());
  console.log("BNKR mint PDA:", bunkercashMintPda.toBase58());
  console.log("Pool signer PDA:", poolSignerPda.toBase58());
  console.log("USDC mint:", usdcMint.toBase58());

  try {
    const pool = await (program.account as any).poolState.fetch(poolPda);
    console.log("PoolState:", {
      admin: (pool.admin as PublicKey).toBase58(),
      priceUsdcPerToken: pool.priceUsdcPerToken?.toString?.() ?? String(pool.priceUsdcPerToken),
      claimCounter: pool.claimCounter?.toString?.() ?? String(pool.claimCounter),
      bump: pool.bump,
    });
  } catch (e) {
    console.log("PoolState: (missing / not initialized)", (e as Error).message);
  }

  const uUsdc = await tokenBalRaw(provider, userUsdcAta);
  const pUsdc = await tokenBalRaw(provider, payoutUsdcVaultAta);
  const uBnkr = await tokenBalRaw(provider, userBnkrAta);
  const eBnkr = await tokenBalRaw(provider, escrowBnkrVaultAta);

  console.log(
    "User USDC (legacy):",
    uUsdc ? `${formatUnits(uUsdc, USDC_DECIMALS)} (${uUsdc.toString()} raw)` : "(missing)",
    "acct=" + userUsdcAta.toBase58()
  );
  console.log(
    "Payout USDC vault (legacy, Pool Signer ATA):",
    pUsdc ? `${formatUnits(pUsdc, USDC_DECIMALS)} (${pUsdc.toString()} raw)` : "(missing)",
    "acct=" + payoutUsdcVaultAta.toBase58()
  );
  console.log(
    "User BNKR (Token-2022):",
    uBnkr ? `${formatUnits(uBnkr, BNKR_DECIMALS)} (${uBnkr.toString()} raw)` : "(missing)",
    "acct=" + userBnkrAta.toBase58()
  );
  console.log(
    "Escrow BNKR vault (Token-2022):",
    eBnkr ? `${formatUnits(eBnkr, BNKR_DECIMALS)} (${eBnkr.toString()} raw)` : "(missing)",
    "acct=" + escrowBnkrVaultAta.toBase58()
  );
}

async function main() {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const payer = (provider.wallet as any).payer as anchor.web3.Keypair | undefined;
  if (!payer) throw new Error("Provider wallet payer not available (need a local keypair wallet).");
  const wallet = provider.wallet.publicKey;

  const program = new Program(idlJson as unknown as Idl, provider);

  // Print available instructions (functions) from the IDL.
  console.log("Available instructions:");
  for (const ix of (idlJson.instructions ?? []) as any[]) {
    console.log("-", ix.name);
  }

  const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from(POOL_SEED)], program.programId);
  const [bunkercashMintPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(MINT_SEED)],
    program.programId
  );
  const [poolSignerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_SIGNER_SEED), poolPda.toBuffer()],
    program.programId
  );

  // Default to USDC-Dev (SPL legacy) on devnet if not provided.
  const usdcMint = new PublicKey(
    process.env.USDC_MINT ?? "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"
  );

  // Initialize pool + mint if missing.
  const poolInfo = await provider.connection.getAccountInfo(poolPda, "confirmed");
  if (!poolInfo) {
    const priceUsdcPerToken = new BN(1_000_000); // 1 USDC (6 decimals) per 1 token
    const initSig = await (program.methods as any)
      .initialize(wallet, priceUsdcPerToken)
      .accounts({
        pool: poolPda,
        bunkercashMint: bunkercashMintPda,
        payer: wallet,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });
    console.log("initialize tx:", initSig);
  }

  // Ensure required ATAs exist.
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
  const userBnkrAta = await ensureAta({
    provider,
    payer,
    mint: bunkercashMintPda,
    owner: wallet,
    allowOwnerOffCurve: false,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  });
  const escrowBnkrVaultAta = await ensureAta({
    provider,
    payer,
    mint: bunkercashMintPda,
    owner: poolSignerPda,
    allowOwnerOffCurve: true,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  });

  await printSnapshot({
    provider,
    program,
    poolPda,
    bunkercashMintPda,
    poolSignerPda,
    usdcMint,
    userUsdcAta,
    payoutUsdcVaultAta,
    userBnkrAta,
    escrowBnkrVaultAta,
  });

  // BUY
  const buyUi = process.env.BUY_USDC ?? "1";
  const buyAmount = uiToBaseUnits(buyUi, USDC_DECIMALS);
  if (buyAmount.lte(new BN(0))) {
    console.log(`\nSkipping buy_primary (BUY_USDC=${buyUi})`);
  } else {
  const userUsdcBefore = await tokenBalRaw(provider, userUsdcAta);
  if (!userUsdcBefore || userUsdcBefore.lt(buyAmount)) {
    console.error(
      `\nInsufficient USDC for buy. Have ${userUsdcBefore ? formatUnits(userUsdcBefore, USDC_DECIMALS) : "0"} USDC, need ${buyUi} USDC.`
    );
    console.error("Fund this wallet on the same cluster/mint, then re-run.");
    console.error("Wallet:", wallet.toBase58());
    console.error("USDC mint:", usdcMint.toBase58());
    process.exitCode = 1;
    return;
  }

  const buySig = await rpcWithBlockhashRetry("buy_primary", async () => {
    return await (program.methods as any)
      .buyPrimary(buyAmount)
      .accounts({
        pool: poolPda,
        poolSigner: poolSignerPda,
        bunkercashMint: bunkercashMintPda,
        user: wallet,
        usdcMint,
        userUsdc: userUsdcAta,
        payoutUsdcVault: payoutUsdcVaultAta,
        userBunkercash: userBnkrAta,
        usdcTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });
  });
  console.log("\nbuy_primary tx:", buySig);

  await printSnapshot({
    provider,
    program,
    poolPda,
    bunkercashMintPda,
    poolSignerPda,
    usdcMint,
    userUsdcAta,
    payoutUsdcVaultAta,
    userBnkrAta,
    escrowBnkrVaultAta,
  });
  }

  // SELL (register_sell escrow lock) - create multiple claims for pro-rata testing.
  const sellUi1 = process.env.SELL_BNKR_1 ?? process.env.SELL_BNKR ?? "0.1";
  const sellUi2 = process.env.SELL_BNKR_2 ?? "0.3";
  const sellAmounts: Array<{ label: string; amount: BN }> = [
    { label: "sell1", amount: uiToBaseUnits(sellUi1, BNKR_DECIMALS) },
    { label: "sell2", amount: uiToBaseUnits(sellUi2, BNKR_DECIMALS) },
  ].filter((x) => x.amount.gt(new BN(0)));

  const createdClaims: PublicKey[] = [];
  for (const s of sellAmounts) {
    // Derive the Claim PDA from the latest on-chain counter.
    // This avoids failures if we have to retry due to blockhash/RPC hiccups.
    let claimPda: PublicKey | null = null;
    const sellSig = await rpcWithBlockhashRetry(`register_sell(${s.label})`, async () => {
      const poolState = await (program.account as any).poolState.fetch(poolPda);
      const claimCounter: BN = poolState.claimCounter as BN;
      const nextId = claimCounter.add(new BN(1));
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("claim"), poolPda.toBuffer(), bnU64LE(nextId)],
        program.programId
      );
      claimPda = pda;
      const [claimPriceSnapshotPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(CLAIM_PRICE_SNAPSHOT_SEED), pda.toBuffer()],
        program.programId
      );
      return await (program.methods as any)
        .registerSell(s.amount)
        .accounts({
          pool: poolPda,
          poolSigner: poolSignerPda,
          bunkercashMint: bunkercashMintPda,
          claim: pda,
          claimPriceSnapshot: claimPriceSnapshotPda,
          user: wallet,
          userBunkercash: userBnkrAta,
          escrowBunkercashVault: escrowBnkrVaultAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });
    });
    console.log(`\nregister_sell(${s.label}) tx:`, sellSig);
    if (!claimPda) throw new Error("Claim PDA was not computed.");
    console.log("Claim PDA:", claimPda.toBase58());
    createdClaims.push(claimPda);
  }

  await printSnapshot({
    provider,
    program,
    poolPda,
    bunkercashMintPda,
    poolSignerPda,
    usdcMint,
    userUsdcAta,
    payoutUsdcVaultAta,
    userBnkrAta,
    escrowBnkrVaultAta,
  });

  // Optional: add extra liquidity before processing claims.
  // Admin must equal pool.admin (and program requires pool.admin == SQUADS_VAULT_PUBKEY).
  // Use .env SQUADS_VAULT_PUBKEY = your test wallet so e2e can sign as admin.
  if (process.env.LIQ_USDC) {
    const poolStateForLiq = await (program.account as any).poolState.fetch(poolPda);
    const adminForLiq = poolStateForLiq.admin as PublicKey;
    const liqAmount = uiToBaseUnits(process.env.LIQ_USDC, USDC_DECIMALS);
    // Admin's USDC ATA: if admin is e2e wallet, use userUsdcAta; else would need to pass the vault ATA.
    const adminUsdcAta =
      adminForLiq.equals(wallet) ? userUsdcAta : await getAssociatedTokenAddressSync(
        usdcMint,
        adminForLiq,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
    const addSig = await rpcWithBlockhashRetry("add_liquidity", async () => {
      return await (program.methods as any)
        .addLiquidity(liqAmount)
        .accounts({
          pool: poolPda,
          poolSigner: poolSignerPda,
          usdcMint,
          admin: adminForLiq,
          adminUsdc: adminUsdcAta,
          payoutUsdcVault: payoutUsdcVaultAta,
          usdcTokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });
    });
    console.log("\nadd_liquidity tx:", addSig);
  }

  // Process each open claim (process_claim = one claim per tx).
  // Admin must equal pool.admin; program also requires pool.admin == SQUADS_VAULT_PUBKEY (compile-time).
  // For e2e to succeed, set SQUADS_VAULT_PUBKEY in programs/bunkercash/.env to your test wallet and initialize with that as admin.
  {
    const poolState = await (program.account as any).poolState.fetch(poolPda);
    const admin = poolState.admin as PublicKey;
    const allClaims = await (program.account as any).claimState.all();
    const open = allClaims.filter((x: any) => !x.account.isClosed);
    console.log(`\nOpen claims: ${open.length}`);

    for (const c of open) {
      console.log(
        "-",
        (c.publicKey as PublicKey).toBase58(),
        "user=" + (c.account.user as PublicKey).toBase58(),
        "locked=" + (c.account.tokenAmountLocked?.toString?.() ?? String(c.account.tokenAmountLocked)),
        "paid=" + (c.account.usdcPaid?.toString?.() ?? String(c.account.usdcPaid))
      );
    }

    for (const c of open) {
      const claimPk = c.publicKey as PublicKey;
      const userPk = c.account.user as PublicKey;
      const userUsdcAtaForClaim = await ensureAta({
        provider,
        payer,
        mint: usdcMint,
        owner: userPk,
        allowOwnerOffCurve: false,
        tokenProgram: TOKEN_PROGRAM_ID,
      });

      const procSig = await rpcWithBlockhashRetry("process_claim", async () => {
        const [claimPriceSnapshotPda] = PublicKey.findProgramAddressSync(
          [Buffer.from(CLAIM_PRICE_SNAPSHOT_SEED), claimPk.toBuffer()],
          program.programId
        );
        return await (program.methods as any)
          .processClaim()
          .accounts({
            pool: poolPda,
            poolSigner: poolSignerPda,
            admin,
            claim: claimPk,
            claimPriceSnapshot: claimPriceSnapshotPda,
            payoutUsdcVault: payoutUsdcVaultAta,
            userUsdc: userUsdcAtaForClaim,
            usdcTokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc({ commitment: "confirmed" });
      });
      console.log("\nprocess_claim", claimPk.toBase58(), "tx:", procSig);
    }
    if (open.length === 0) {
      console.log("\nprocess_claim: skipped (no open claims)");
    }
  }

  await printSnapshot({
    provider,
    program,
    poolPda,
    bunkercashMintPda,
    poolSignerPda,
    usdcMint,
    userUsdcAta,
    payoutUsdcVaultAta,
    userBnkrAta,
    escrowBnkrVaultAta,
  });

  // Print created claim states (if any).
  for (const pk of createdClaims) {
    const claim = await (program.account as any).claimState.fetch(pk);
    console.log("\nClaimState:", pk.toBase58(), {
      id: claim.id?.toString?.() ?? String(claim.id),
      user: claim.user?.toBase58?.() ?? String(claim.user),
      tokenAmountLocked: claim.tokenAmountLocked?.toString?.() ?? String(claim.tokenAmountLocked),
      usdcPaid: claim.usdcPaid?.toString?.() ?? String(claim.usdcPaid),
      isClosed: claim.isClosed,
      createdAt: claim.createdAt?.toString?.() ?? String(claim.createdAt),
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
