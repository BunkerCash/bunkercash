import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Bunkercash } from "../target/types/bunkercash";
import { PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMint,
  getAssociatedTokenAddressSync,
  getAccount,
  mintTo,
} from "@solana/spl-token";

/** Legacy USDC mints (SPL Token) so Phantom balance works. */
const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function toUi(amount: bigint, decimals: number) {
  const s = amount.toString().padStart(decimals + 1, "0");
  const head = s.slice(0, -decimals);
  const tail = s.slice(-decimals).replace(/0+$/, "");
  return tail.length ? `${head}.${tail}` : head;
}

async function ensureAta(params: {
  connection: anchor.web3.Connection;
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

  const info = await params.connection.getAccountInfo(ata, "confirmed");
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
  await anchor.web3.sendAndConfirmTransaction(params.connection, tx, [params.payer], {
    commitment: "confirmed",
  });

  return ata;
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const payer = (provider.wallet as any).payer;
  const wallet = provider.wallet.publicKey;
  const program = anchor.workspace.Bunkercash as Program<Bunkercash>;

  const [primaryPool] = PublicKey.findProgramAddressSync(
    [Buffer.from("primary_pool")],
    program.programId
  );

  const buyer =
    process.env.BUYER_PUBKEY || process.env.BUYER
      ? new PublicKey(process.env.BUYER_PUBKEY || process.env.BUYER!)
      : wallet;

  console.log("Wallet:", wallet.toBase58());
  console.log("Buyer: ", buyer.toBase58());
  console.log("Program:", program.programId.toBase58());
  console.log("Primary pool PDA:", primaryPool.toBase58());

  const usdcMintDecimals = 6;
  const bunkercashDecimals = 9;

  // Legacy USDC: use env USDC_MINT or default devnet/mainnet mint so Phantom balance works.
  const useLegacyUsdc = !!(
    process.env.USDC_MINT ||
    process.env.USE_LEGACY_USDC
  );
  const legacyUsdcMint = process.env.USDC_MINT
    ? new PublicKey(process.env.USDC_MINT)
    : process.env.USE_LEGACY_USDC
      ? new PublicKey(process.env.CLUSTER === "mainnet" ? MAINNET_USDC_MINT : DEVNET_USDC_MINT)
      : null;

  const priceUsdcPerToken = new anchor.BN(1_000_000); // 1 USDC = 1 BRENT
  let usdcMint: PublicKey;
  let bunkercashMint: PublicKey;
  let usdcTokenProgram: PublicKey = TOKEN_PROGRAM_ID;

  try {
    const state = await program.account.primaryPoolState.fetch(primaryPool);
    usdcMint = state.usdcMint as PublicKey;
    bunkercashMint = state.bunkercashMint as PublicKey;
    const mintInfo = await provider.connection.getAccountInfo(usdcMint);
    usdcTokenProgram = mintInfo?.owner
      ? new PublicKey(mintInfo.owner)
      : TOKEN_PROGRAM_ID;
    console.log("Primary sale already initialized; using existing mints.");
    console.log("USDC mint:", usdcMint.toBase58(), "program:", usdcTokenProgram.equals(TOKEN_PROGRAM_ID) ? "legacy" : "Token-2022");
    console.log("BunkerCash mint:", bunkercashMint.toBase58());
  } catch {
    if (useLegacyUsdc && legacyUsdcMint) {
      usdcMint = legacyUsdcMint;
      usdcTokenProgram = TOKEN_PROGRAM_ID;
      console.log("Primary sale not initialized; using legacy USDC mint:", usdcMint.toBase58());
    } else {
      console.log("Primary sale not initialized yet; creating test mints and initializing...");
      usdcMint = await createMint(
        provider.connection,
        payer,
        wallet,
        null,
        usdcMintDecimals,
        undefined,
        { commitment: "confirmed" },
        TOKEN_2022_PROGRAM_ID
      );
      usdcTokenProgram = TOKEN_2022_PROGRAM_ID;
    }

    bunkercashMint = await createMint(
      provider.connection,
      payer,
      primaryPool,
      null,
      bunkercashDecimals,
      undefined,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );

    console.log("USDC mint:", usdcMint.toBase58());
    console.log("BunkerCash mint:", bunkercashMint.toBase58());

    const initTx = await program.methods
      .initializePrimarySale(wallet, priceUsdcPerToken)
      .accounts({
        primaryPool,
        payer: wallet,
        usdcMint,
        bunkercashMint,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .rpc({ commitment: "confirmed" });
    console.log("initialize_primary_sale tx:", initTx);
  }

  const buyerUsdcAta = await ensureAta({
    connection: provider.connection,
    payer,
    mint: usdcMint,
    owner: buyer,
    allowOwnerOffCurve: false,
    tokenProgram: usdcTokenProgram,
  });

  const poolUsdcVaultAta = await ensureAta({
    connection: provider.connection,
    payer,
    mint: usdcMint,
    owner: primaryPool,
    allowOwnerOffCurve: true,
    tokenProgram: usdcTokenProgram,
  });

  const buyerBunkercashAta = await ensureAta({
    connection: provider.connection,
    payer,
    mint: bunkercashMint,
    owner: buyer,
    allowOwnerOffCurve: false,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  });

  console.log("Buyer USDC ATA:", buyerUsdcAta.toBase58());
  console.log("Pool USDC vault ATA:", poolUsdcVaultAta.toBase58());
  console.log("Buyer BunkerCash ATA:", buyerBunkercashAta.toBase58());

  // Mint test "USDC" only when using Token-2022 test mint (not legacy USDC).
  if (usdcTokenProgram.equals(TOKEN_2022_PROGRAM_ID)) {
    const initialBuyerUsdc = BigInt(10_000_000); // 10 USDC
    try {
      await mintTo(
        provider.connection,
        payer,
        usdcMint,
        buyerUsdcAta,
        wallet,
        initialBuyerUsdc,
        [],
        { commitment: "confirmed" },
        TOKEN_2022_PROGRAM_ID
      );
      console.log("Minted", toUi(initialBuyerUsdc, usdcMintDecimals), "USDC to", buyer.toBase58());
    } catch (e) {
      console.log(
        "Note: could not mint test USDC. You can still buy if your buyer wallet already has USDC for this mint."
      );
      console.log(String(e));
    }
  } else {
    console.log("Using legacy USDC mint; no test mint. Buyer must have USDC in Phantom.");
  }

  const usdcAmount = new anchor.BN(2_500_000); // 2.5 USDC
  if (!buyer.equals(wallet)) {
    console.log("\nSetup complete for BUYER wallet.");
    console.log("Now connect the buyer wallet in the web app and buy from the UI.");
    return;
  }

  console.log(
    "\n========== STEP 2: BUYING",
    toUi(BigInt(usdcAmount.toString()), usdcMintDecimals),
    "USDC worth of BunkerCash =========="
  );
  const buyTx = await program.methods
    .buyPrimary(usdcAmount)
    .accounts({
      primaryPool,
      user: wallet,
      usdcMint,
      bunkercashMint,
      userUsdc: buyerUsdcAta,
      poolUsdcVault: poolUsdcVaultAta,
      userBunkercash: buyerBunkercashAta,
      usdcTokenProgram,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any)
    .rpc({ commitment: "confirmed" });

  console.log("  Tx signature:", buyTx);

  console.log("\nOK: buy_primary sent.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

