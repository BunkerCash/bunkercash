/**
 * Server-side Solana helpers.
 *
 * These functions mirror the client-side logic in hooks/ but are designed
 * to run in API routes where there is no wallet context.  Results are
 * cached in Cloudflare KV via `cachedFetch` so every user reads from the
 * nearest edge PoP instead of hitting the RPC directly.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  getReadonlyProgram,
  getPoolPda,
  getBunkercashMintPda,
  getPoolSignerPda,
  PROGRAM_ID,
} from "@/lib/program";
import { getClusterFromEndpoint, getUsdcMintForCluster } from "@/lib/constants";
import { fetchDecodedClaimAccounts } from "@/lib/claim-accounts";
import type { DecodedClaimAccount } from "@/lib/claim-accounts";

// ── Types ──────────────────────────────────────────────

interface Stringable {
  toString(): string;
}

interface PoolAccountLike {
  nav: Stringable;
  totalBrentSupply: Stringable;
  totalPendingClaims: Stringable;
  masterWallet: PublicKey;
}

export interface PoolDataResponse {
  tokenPrice: number;
  totalSupplyRaw: number;
  navUsdcRaw: number;
  pendingClaimsUsdcRaw: number;
  treasuryUsdcRaw: number | null;
  pricePerToken: number;
  adminWallet: string;
  ts: number;
}

export interface SerializedClaim {
  pubkey: string;
  id: string;
  user: string;
  requestedUsdc: string;
  paidUsdc: string;
  remainingUsdc: string;
  processed: boolean;
  createdAt: string;
}

export interface ClaimsResponse {
  open: SerializedClaim[];
  closed: SerializedClaim[];
  totalRequestedUsdc: string;
  openCount: number;
  ts: number;
}

// ── Helpers ────────────────────────────────────────────

const BUNKERCASH_DECIMALS = 6;
const USDC_DECIMALS = 6;

function getConnection(): Connection {
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  return new Connection(endpoint, "confirmed");
}

function serializeClaim(claim: DecodedClaimAccount): SerializedClaim {
  return {
    pubkey: claim.pubkey.toBase58(),
    id: claim.id,
    user: claim.user.toBase58(),
    requestedUsdc: claim.requestedUsdc,
    paidUsdc: claim.paidUsdc,
    remainingUsdc: claim.remainingUsdc,
    processed: claim.processed,
    createdAt: claim.createdAt,
  };
}

// ── Fetchers (called by cachedFetch in the route handlers) ─────

export async function fetchPoolData(): Promise<PoolDataResponse> {
  const connection = getConnection();
  const program = getReadonlyProgram(connection);
  const poolPda = getPoolPda(PROGRAM_ID);
  const mintPda = getBunkercashMintPda(PROGRAM_ID);

  const accountApi = program.account as {
    pool: { fetch: (pubkey: PublicKey) => Promise<PoolAccountLike> };
  };

  const [mintInfo, poolAccount] = await Promise.all([
    connection.getTokenSupply(mintPda, "confirmed"),
    accountApi.pool.fetch(poolPda),
  ]);

  const totalSupplyRaw =
    Number(mintInfo.value.amount) / 10 ** BUNKERCASH_DECIMALS;
  const navUsdcRaw =
    Number(poolAccount.nav.toString()) / 10 ** USDC_DECIMALS;
  const pendingClaimsUsdcRaw =
    Number(poolAccount.totalPendingClaims.toString()) / 10 ** USDC_DECIMALS;

  const tokenPrice = totalSupplyRaw > 0 ? navUsdcRaw / totalSupplyRaw : 1;
  const adminWallet = poolAccount.masterWallet.toBase58();

  // Vault balance
  let treasuryUsdcRaw: number | null = null;
  try {
    const poolSignerPda = getPoolSignerPda(poolPda, PROGRAM_ID);
    const endpoint = (connection as { rpcEndpoint?: string }).rpcEndpoint ?? "";
    const cluster = getClusterFromEndpoint(endpoint);
    const usdcMint = getUsdcMintForCluster(cluster);

    if (usdcMint) {
      const payoutVault = getAssociatedTokenAddressSync(
        usdcMint,
        poolSignerPda,
        true,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      const bal = await connection.getTokenAccountBalance(payoutVault);
      treasuryUsdcRaw = bal.value.uiAmount ?? 0;
    }
  } catch {
    // Vault may not exist yet
    treasuryUsdcRaw = 0;
  }

  return {
    tokenPrice,
    totalSupplyRaw,
    navUsdcRaw,
    pendingClaimsUsdcRaw,
    treasuryUsdcRaw,
    pricePerToken: tokenPrice,
    adminWallet,
    ts: Date.now(),
  };
}

export async function fetchAllClaims(): Promise<ClaimsResponse> {
  const connection = getConnection();
  const allClaims = await fetchDecodedClaimAccounts(connection);

  const open: SerializedClaim[] = [];
  const closed: SerializedClaim[] = [];
  let totalRequested = BigInt(0);

  for (const claim of allClaims) {
    const serialized = serializeClaim(claim);
    if (claim.processed) {
      closed.push(serialized);
    } else {
      open.push(serialized);
      totalRequested += BigInt(claim.remainingUsdc);
    }
  }

  return {
    open,
    closed,
    totalRequestedUsdc: totalRequested.toString(),
    openCount: open.filter((c) => BigInt(c.remainingUsdc) > BigInt(0)).length,
    ts: Date.now(),
  };
}

// ── Transaction types & fetcher ────────────────────────

export interface SerializedTransaction {
  id: string;
  type: "investment" | "withdrawal";
  amount: number;
  tokenAmount?: number;
  timestamp: number; // epoch ms
  txSignature?: string;
}

export interface TransactionsResponse {
  transactions: SerializedTransaction[];
  ts: number;
}

const DEPOSIT_USDC_DISC = [184, 148, 250, 169, 224, 213, 34, 126];

function bytesEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export async function fetchTransactionsForWallet(
  wallet: string,
): Promise<TransactionsResponse> {
  try {
    new PublicKey(wallet);
  } catch {
    return { transactions: [], ts: Date.now() };
  }

  const results: SerializedTransaction[] = [];

  // Use the already-cached claims data as the primary source.
  // This avoids expensive per-signature RPC parsing entirely.
  // Claims cover all withdrawals; deposits are detected via
  // a single lightweight getSignaturesForAddress call filtered to our program.
  try {
    const { kvGet } = await import("@bunkercash/cloudflare-kv");
    // Read claims from KV directly — this function is already called inside
    // cachedFetch from the route handler, so nesting another cachedFetch would
    // create redundant cache layers.  Fall back to a fresh RPC fetch if the
    // KV entry is missing (cold start).
    const cached = await kvGet<{ data: ClaimsResponse }>("GEOBLOCKING_KV", "cache:claims");
    const claimsData = cached?.data ?? await fetchAllClaims();
    const allClaims = [...claimsData.open, ...claimsData.closed];
    const myClaims = allClaims.filter((c) => c.user === wallet);

    for (const claim of myClaims) {
      const requestedUsdc = Number(claim.requestedUsdc) / 10 ** USDC_DECIMALS;
      const paidUsdc = Number(claim.paidUsdc) / 10 ** USDC_DECIMALS;
      const createdAt = Number(claim.createdAt);
      const claimTs = createdAt ? createdAt * 1000 : Date.now();

      results.push({
        id: `claim-${claim.id}`,
        type: "withdrawal",
        amount: paidUsdc > 0 ? paidUsdc : requestedUsdc,
        timestamp: claimTs,
      });
    }
  } catch {
    // Claims lookup failed
  }

  // Detect deposits via program signature scan (single RPC call, no tx parsing)
  try {
    const connection = getConnection();
    const walletPubkey = new PublicKey(wallet);

    const signatures = await connection.getSignaturesForAddress(
      walletPubkey,
      { limit: 20 },
      "confirmed",
    );

    if (signatures.length > 0) {
      const batch = signatures;
      const bs58 = await import("bs58");

      let txs: (import("@solana/web3.js").ParsedTransactionWithMeta | null)[];
      try {
        txs = await connection.getParsedTransactions(
          batch.map((s) => s.signature),
          { commitment: "confirmed", maxSupportedTransactionVersion: 0 },
        );
      } catch {
        txs = [];
      }

      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        if (!tx?.meta || tx.meta.err) continue;

        const sig = batch[i];
        const blockTime = tx.blockTime;

        for (const ix of tx.transaction.message.instructions) {
          if (
            "programId" in ix &&
            ix.programId.equals(PROGRAM_ID) &&
            "data" in ix
          ) {
            try {
              if (typeof ix.data !== "string") continue;
              const dataBytes = Array.from(bs58.default.decode(ix.data));
              const disc = dataBytes.slice(0, 8);

              if (bytesEqual(disc, DEPOSIT_USDC_DISC)) {
                const amountBN = new BN(
                  Buffer.from(dataBytes.slice(8, 16)),
                  "le",
                );
                results.push({
                  id: `buy-${sig.signature.slice(0, 8)}`,
                  type: "investment",
                  amount: Number(amountBN.toString()) / 10 ** USDC_DECIMALS,
                  timestamp: blockTime ? blockTime * 1000 : Date.now(),
                  txSignature: sig.signature,
                });
              }
            } catch {
              // Skip unparseable
            }
          }
        }
      }
    }
  } catch {
    // Deposit scan failed — return claims data only
  }

  results.sort((a, b) => b.timestamp - a.timestamp);
  return { transactions: results, ts: Date.now() };
}

// ── Token balance fetcher ──────────────────────────────

export interface BalanceResponse {
  balance: string;
  ts: number;
}

export async function fetchTokenBalance(wallet: string): Promise<BalanceResponse> {
  const connection = getConnection();
  const mintPda = getBunkercashMintPda(PROGRAM_ID);
  const walletPubkey = new PublicKey(wallet);

  const ata = getAssociatedTokenAddressSync(
    mintPda,
    walletPubkey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  try {
    const bal = await connection.getTokenAccountBalance(ata, "confirmed");
    return { balance: bal.value.uiAmountString ?? "0", ts: Date.now() };
  } catch {
    return { balance: "0", ts: Date.now() };
  }
}

// ── Pool admin fetcher (for isAdmin check) ─────────────

export interface PoolAdminResponse {
  adminWallet: string;
  ts: number;
}

export async function fetchPoolAdmin(): Promise<PoolAdminResponse> {
  const connection = getConnection();
  const program = getReadonlyProgram(connection);
  const poolPda = getPoolPda(PROGRAM_ID);

  const accountApi = program.account as {
    pool: { fetch: (pubkey: PublicKey) => Promise<PoolAccountLike> };
  };

  const poolAccount = await accountApi.pool.fetch(poolPda);
  return {
    adminWallet: poolAccount.masterWallet.toBase58(),
    ts: Date.now(),
  };
}
