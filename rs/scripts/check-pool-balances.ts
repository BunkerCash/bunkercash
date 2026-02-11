/**
 * Check pool + vault + user balances on a cluster.
 *
 * Prints:
 * - Program + PDAs (pool, mint, pool signer)
 * - PoolState (price, claim_counter)
 * - Token accounts + balances:
 *   - user USDC ATA (legacy SPL)
 *   - pool USDC vault ATA (legacy SPL)
 *   - user BNKR ATA (Token-2022)
 *   - escrow BNKR vault ATA (Token-2022, owned by pool signer)
 *
 * Run:
 * cd rs
 * export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
 * export ANCHOR_WALLET=~/.config/solana/id.json
 * export USDC_MINT=<your usdc mint>   # optional; defaults to Circle devnet USDC
 * npx ts-node -P tsconfig.json scripts/check-pool-balances.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
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
const DEFAULT_DEVNET_USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

async function balanceOrMissing(
  provider: AnchorProvider,
  tokenAccount: PublicKey,
  label: string
): Promise<string> {
  const info = await provider.connection.getAccountInfo(tokenAccount, "confirmed");
  if (!info) return `${label}: (missing / not initialized) ${tokenAccount.toBase58()}`;
  const bal = await provider.connection.getTokenAccountBalance(tokenAccount, "confirmed");
  return `${label}: ${bal.value.uiAmountString ?? bal.value.amount} (${bal.value.amount} raw)  acct=${tokenAccount.toBase58()}`;
}

async function main() {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const wallet = provider.wallet.publicKey;
  const program = new Program(idlJson as unknown as Idl, provider);

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

  const usdcMint = new PublicKey(process.env.USDC_MINT ?? DEFAULT_DEVNET_USDC_MINT);

  const userUsdcAta = getAssociatedTokenAddressSync(
    usdcMint,
    wallet,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const payoutUsdcVaultAta = getAssociatedTokenAddressSync(
    usdcMint,
    poolSignerPda,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const userBunkercashAta = getAssociatedTokenAddressSync(
    bunkercashMintPda,
    wallet,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const escrowBunkercashVaultAta = getAssociatedTokenAddressSync(
    bunkercashMintPda,
    poolSignerPda,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  console.log("Cluster:", provider.connection.rpcEndpoint);
  console.log("Wallet:", wallet.toBase58());
  console.log("Program:", program.programId.toBase58());
  console.log("Pool PDA:", poolPda.toBase58());
  console.log("BNKR mint PDA:", bunkercashMintPda.toBase58());
  console.log("Pool signer PDA:", poolSignerPda.toBase58());
  console.log("USDC mint:", usdcMint.toBase58());

  // Pool state
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

  console.log(await balanceOrMissing(provider, userUsdcAta, "User USDC (legacy)"));
  console.log(await balanceOrMissing(provider, payoutUsdcVaultAta, "Payout USDC vault (legacy, Pool Signer ATA)"));
  console.log(await balanceOrMissing(provider, userBunkercashAta, "User BNKR (Token-2022)"));
  console.log(await balanceOrMissing(provider, escrowBunkercashVaultAta, "Escrow BNKR vault (Token-2022)"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

