import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Bunkercash } from "../target/types/bunkercash";
import { PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

function toUi(amount: bigint, decimals: number) {
  const s = amount.toString().padStart(decimals + 1, "0");
  const head = s.slice(0, -decimals);
  const tail = s.slice(-decimals).replace(/0+$/, "");
  return tail.length ? `${head}.${tail}` : head;
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

  console.log("Wallet:", wallet.toBase58());
  console.log("Program:", program.programId.toBase58());
  console.log("Primary pool PDA:", primaryPool.toBase58());

  // Create a Token-2022 "USDC" mint (6 decimals) and a BunkerCash mint (9 decimals).
  // This script is self-contained for devnet testing; it does not depend on any oracle/NAV logic.
  const usdcMintDecimals = 6;
  const bunkercashDecimals = 9;

  const usdcMint = await createMint(
    provider.connection,
    payer,
    wallet, // mint authority (for test minting only)
    null,
    usdcMintDecimals,
    undefined,
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );

  const bunkercashMint = await createMint(
    provider.connection,
    payer,
    primaryPool, // mint authority = primary pool PDA
    null,
    bunkercashDecimals,
    undefined,
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );

  console.log("USDC (test) mint:", usdcMint.toBase58());
  console.log("BunkerCash mint:", bunkercashMint.toBase58());

  const userUsdc = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    payer,
    usdcMint,
    wallet,
    false,
    "confirmed",
    undefined,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const poolUsdcVault = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    payer,
    usdcMint,
    primaryPool,
    true, // allowOwnerOffCurve (PDA)
    "confirmed",
    undefined,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const userBunkercash = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    payer,
    bunkercashMint,
    wallet,
    false,
    "confirmed",
    undefined,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Mint some "USDC" to the user to buy with.
  const initialUserUsdc = BigInt(10_000_000); // 10 USDC
  await mintTo(
    provider.connection,
    payer,
    usdcMint,
    userUsdc.address,
    wallet,
    initialUserUsdc,
    [],
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );

  // Initialize primary sale state if it doesn't exist yet.
  const priceUsdcPerToken = new anchor.BN(1_250_000); // 1.25 USDC per 1 token
  try {
    await program.account.primaryPoolState.fetch(primaryPool);
    console.log("Primary sale already initialized; skipping init.");
  } catch {
    const initTx = await program.methods
      .initializePrimarySale(wallet, priceUsdcPerToken)
      .accounts({
        primaryPool,
        payer: wallet,
        usdcMint,
        bunkercashMint,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });
    console.log("initialize_primary_sale tx:", initTx);
  }

  const beforeUserUsdc = await getAccount(
    provider.connection,
    userUsdc.address,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );
  const beforePoolUsdc = await getAccount(
    provider.connection,
    poolUsdcVault.address,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );
  const beforeUserBunkercash = await getAccount(
    provider.connection,
    userBunkercash.address,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );

  console.log("\nBefore:");
  console.log("  user USDC:", toUi(beforeUserUsdc.amount, usdcMintDecimals));
  console.log("  pool USDC:", toUi(beforePoolUsdc.amount, usdcMintDecimals));
  console.log(
    "  user BunkerCash:",
    toUi(beforeUserBunkercash.amount, bunkercashDecimals)
  );

  const usdcAmount = new anchor.BN(2_500_000); // 2.5 USDC
  const buyTx = await program.methods
    .buyPrimary(usdcAmount)
    .accounts({
      primaryPool,
      user: wallet,
      usdcMint,
      bunkercashMint,
      userUsdc: userUsdc.address,
      poolUsdcVault: poolUsdcVault.address,
      userBunkercash: userBunkercash.address,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .rpc({ commitment: "confirmed" });

  console.log("\nbuy_primary tx:", buyTx);

  const afterUserUsdc = await getAccount(
    provider.connection,
    userUsdc.address,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );
  const afterPoolUsdc = await getAccount(
    provider.connection,
    poolUsdcVault.address,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );
  const afterUserBunkercash = await getAccount(
    provider.connection,
    userBunkercash.address,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );

  console.log("\nAfter:");
  console.log("  user USDC:", toUi(afterUserUsdc.amount, usdcMintDecimals));
  console.log("  pool USDC:", toUi(afterPoolUsdc.amount, usdcMintDecimals));
  console.log(
    "  user BunkerCash:",
    toUi(afterUserBunkercash.amount, bunkercashDecimals)
  );

  // Basic assertions (Definition of Done)
  const usdcDeltaUser = beforeUserUsdc.amount - afterUserUsdc.amount;
  const usdcDeltaPool = afterPoolUsdc.amount - beforePoolUsdc.amount;
  if (usdcDeltaUser !== BigInt(usdcAmount.toString())) {
    throw new Error(
      `User USDC did not decrease by expected amount. expected=${usdcAmount.toString()} actual=${usdcDeltaUser.toString()}`
    );
  }
  if (usdcDeltaPool !== BigInt(usdcAmount.toString())) {
    throw new Error(
      `Pool USDC did not increase by expected amount. expected=${usdcAmount.toString()} actual=${usdcDeltaPool.toString()}`
    );
  }

  // Expected token output:
  // token_amount = usdc_amount * 10^token_decimals / price_usdc_per_token
  const expectedToken = (BigInt(usdcAmount.toString()) * BigInt(10 ** bunkercashDecimals)) /
    BigInt(priceUsdcPerToken.toString());
  const tokenDeltaUser = afterUserBunkercash.amount - beforeUserBunkercash.amount;
  if (tokenDeltaUser !== expectedToken) {
    throw new Error(
      `User BunkerCash did not increase by expected amount. expected=${expectedToken.toString()} actual=${tokenDeltaUser.toString()}`
    );
  }

  console.log("\nOK: buy_primary passed basic balance checks.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

