import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Bunkercash } from "../target/types/bunkercash";
import { PublicKey } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

type DevnetConfig = {
  brentMint: string;
  poolPda: string;
  programId: string;
  network: "devnet";
  masterWallet: string;
};

function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) throw new Error(msg);
}

function short(pk: PublicKey) {
  const s = pk.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const walletPk = provider.wallet.publicKey;
  const payer = (provider.wallet as any).payer;
  const commitment: anchor.web3.Commitment = "confirmed";
  const confirmOptions = { commitment } as any;
  console.log("Wallet:", walletPk.toBase58());

  // Load config written by setup scripts.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs");
  const config: DevnetConfig = JSON.parse(
    fs.readFileSync("./scripts/devnet-config.json", "utf8")
  );

  assert(config.network === "devnet", "scripts/devnet-config.json must be devnet");

  const program = anchor.workspace.Bunkercash as Program<Bunkercash>;
  console.log("Program (workspace):", program.programId.toBase58());
  console.log("Program (config):   ", config.programId);

  // Safety: ensure we are talking to the expected deployed program.
  assert(
    program.programId.toBase58() === config.programId,
    "Program ID mismatch: Anchor workspace programId != devnet-config.json"
  );

  const poolPda = new PublicKey(config.poolPda);
  const brentMint = new PublicKey(config.brentMint);

  console.log("\n=== 1) Create mock Token-2022 USDC mint (decimals=6) ===");
  const usdcMint = await createMint(
    provider.connection,
    payer,
    walletPk,
    null,
    6,
    undefined,
    confirmOptions,
    TOKEN_2022_PROGRAM_ID
  );
  console.log("Mock USDC mint:", usdcMint.toBase58());

  console.log("\n=== 2) Create token accounts (ATAs) ===");
  const userUsdc = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    payer,
    usdcMint,
    walletPk,
    undefined,
    commitment,
    confirmOptions,
    TOKEN_2022_PROGRAM_ID
  );
  console.log("User USDC ATA:", userUsdc.address.toBase58());

  const poolUsdc = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    payer,
    usdcMint,
    poolPda,
    true, // allowOwnerOffCurve (PDA)
    commitment,
    confirmOptions,
    TOKEN_2022_PROGRAM_ID
  );
  console.log("Pool USDC ATA:", poolUsdc.address.toBase58(), `(owner=${short(poolPda)})`);

  const userBrent = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    payer,
    brentMint,
    walletPk,
    undefined,
    commitment,
    confirmOptions,
    TOKEN_2022_PROGRAM_ID
  );
  console.log("User bRENT ATA:", userBrent.address.toBase58());

  console.log("\n=== 3) Mint mock USDC to user ===");
  const userUsdcAmount = 10_000_000; // 10 USDC (6 decimals)
  const mintSig = await mintTo(
    provider.connection,
    payer,
    usdcMint,
    userUsdc.address,
    walletPk,
    userUsdcAmount,
    undefined,
    confirmOptions,
    TOKEN_2022_PROGRAM_ID
  );
  console.log("MintTo signature:", mintSig);

  console.log("\n=== 4) Deposit USDC -> mint bRENT ===");
  const depositAmount = 5_000_000; // 5 USDC
  const depositSig = await program.methods
    .depositUsdc(new anchor.BN(depositAmount))
    .accounts({
      pool: poolPda,
      user: walletPk,
      userUsdc: userUsdc.address,
      userBrent: userBrent.address,
      poolUsdc: poolUsdc.address,
      brentMint,
      usdcMint,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    } as any)
    .rpc();
  console.log("Deposit signature:", depositSig);

  const poolAfterDeposit = await program.account.pool.fetch(poolPda);
  console.log(
    "Pool after deposit:",
    "nav=",
    poolAfterDeposit.nav.toString(),
    "supply=",
    poolAfterDeposit.totalBrentSupply.toString()
  );

  console.log("\n=== 5) File claim (burn bRENT) ===");
  // Derive expected claim PDA for the current claim_counter (used as seed before increment).
  const claimCounterBefore = poolAfterDeposit.claimCounter.toNumber();
  const [claimPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("claim"),
      walletPk.toBuffer(),
      new anchor.BN(claimCounterBefore).toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );
  const brentToBurn = 1_000_000; // 1 bRENT
  const fileClaimSig = await program.methods
    .fileClaim(new anchor.BN(brentToBurn))
    .accounts({
      pool: poolPda,
      claim: claimPda,
      user: walletPk,
      userBrent: userBrent.address,
      brentMint,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    } as any)
    .rpc();
  console.log("FileClaim signature:", fileClaimSig);

  const claim = await program.account.claim.fetch(claimPda);
  console.log(
    "Claim:",
    "usdc_amount=",
    claim.usdcAmount.toString(),
    "processed=",
    claim.processed
  );

  console.log("\n=== 6) Settle claims (master wallet pays claim) ===");
  const settleSig = await program.methods
    .settleClaims(Buffer.from([]))
    .accounts({
      pool: poolPda,
      masterWallet: walletPk, // current wallet is master for this devnet setup
      poolUsdc: poolUsdc.address,
      usdcMint,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any)
    .remainingAccounts([
      { pubkey: claimPda, isWritable: true, isSigner: false },
      { pubkey: userUsdc.address, isWritable: true, isSigner: false },
    ])
    .rpc();
  console.log("SettleClaims signature:", settleSig);

  const claimAfter = await program.account.claim.fetch(claimPda);
  console.log(
    "Claim after settle:",
    "processed=",
    claimAfter.processed,
    "paid_amount=",
    claimAfter.paidAmount.toString()
  );

  console.log("\nDone ✅");
  console.log("Tip: open these txs in Solana Explorer (cluster=devnet):");
  console.log("- mintTo:", mintSig);
  console.log("- deposit:", depositSig);
  console.log("- fileClaim:", fileClaimSig);
  console.log("- settle:", settleSig);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

