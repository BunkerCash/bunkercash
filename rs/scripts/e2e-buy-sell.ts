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
  poolUsdcVaultAta: PublicKey;
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
    poolUsdcVaultAta,
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
  const pUsdc = await tokenBalRaw(provider, poolUsdcVaultAta);
  const uBnkr = await tokenBalRaw(provider, userBnkrAta);
  const eBnkr = await tokenBalRaw(provider, escrowBnkrVaultAta);

  console.log(
    "User USDC (legacy):",
    uUsdc ? `${formatUnits(uUsdc, USDC_DECIMALS)} (${uUsdc.toString()} raw)` : "(missing)",
    "acct=" + userUsdcAta.toBase58()
  );
  console.log(
    "Pool USDC vault (legacy):",
    pUsdc ? `${formatUnits(pUsdc, USDC_DECIMALS)} (${pUsdc.toString()} raw)` : "(missing)",
    "acct=" + poolUsdcVaultAta.toBase58()
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
  const poolUsdcVaultAta = await ensureAta({
    provider,
    payer,
    mint: usdcMint,
    owner: poolPda,
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
    poolUsdcVaultAta,
    userBnkrAta,
    escrowBnkrVaultAta,
  });

  // BUY
  const buyUi = process.env.BUY_USDC ?? "1";
  const buyAmount = uiToBaseUnits(buyUi, USDC_DECIMALS);
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
        bunkercashMint: bunkercashMintPda,
        user: wallet,
        usdcMint,
        userUsdc: userUsdcAta,
        poolUsdcVault: poolUsdcVaultAta,
        userBunkercash: userBnkrAta,
        usdcTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
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
    poolUsdcVaultAta,
    userBnkrAta,
    escrowBnkrVaultAta,
  });

  // SELL (register_sell escrow lock)
  const sellUi = process.env.SELL_BNKR ?? "0.1";
  const sellAmount = uiToBaseUnits(sellUi, BNKR_DECIMALS);

  // Derive the Claim PDA from the latest on-chain counter.
  // This avoids failures if we have to retry due to blockhash/RPC hiccups.
  let claimPda: PublicKey | null = null;
  const sellSig = await rpcWithBlockhashRetry("register_sell", async () => {
    const poolState = await (program.account as any).poolState.fetch(poolPda);
    const claimCounter: BN = poolState.claimCounter as BN;
    const nextId = claimCounter.add(new BN(1));
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("claim"), poolPda.toBuffer(), bnU64LE(nextId)],
      program.programId
    );
    claimPda = pda;
    return await (program.methods as any)
      .registerSell(sellAmount)
      .accounts({
        pool: poolPda,
        poolSigner: poolSignerPda,
        bunkercashMint: bunkercashMintPda,
        claim: pda,
        user: wallet,
        userBunkercash: userBnkrAta,
        escrowBunkercashVault: escrowBnkrVaultAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });
  });
  console.log("\nregister_sell tx:", sellSig);
  if (!claimPda) throw new Error("Claim PDA was not computed.");
  console.log("Claim PDA:", claimPda.toBase58());

  await printSnapshot({
    provider,
    program,
    poolPda,
    bunkercashMintPda,
    poolSignerPda,
    usdcMint,
    userUsdcAta,
    poolUsdcVaultAta,
    userBnkrAta,
    escrowBnkrVaultAta,
  });

  const claim = await (program.account as any).claimState.fetch(claimPda);
  console.log("\nClaimState:", {
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

