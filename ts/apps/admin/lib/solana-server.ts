/**
 * Server-side Solana helpers for the admin app.
 * Results are cached in Cloudflare KV via `cachedFetch`.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { clusterApiUrl } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  getFeeConfigPda,
  getReadonlyProgram,
  getPoolPda,
  getPoolSignerPda,
  fetchMintTokenProgram,
  fetchConfiguredUsdcMint,
  PROGRAM_ID,
} from "@/lib/program";
import { fetchDecodedClaimAccounts } from "@/lib/claim-accounts";
import type { DecodedClaimAccount } from "@/lib/claim-accounts";
import { getClusterFromEndpoint } from "@/lib/constants";
import { getConfiguredRpcCluster, getServerRpcEndpoint } from "@/lib/solana-env";

// ── Types ──────────────────────────────────────────────

interface Stringable {
  toString(): string;
}

interface PoolAccountLike {
  masterWallet: PublicKey;
  nav: Stringable;
  totalBunkercashSupply: Stringable;
  totalPendingClaims: Stringable;
}

interface FeeConfigAccountLike {
  purchaseFeeBps: Stringable;
  claimFeeBps: Stringable;
}

export interface PoolDataResponse {
  tokenPrice: number;
  totalSupplyRaw: number;
  navUsdcRaw: number;
  pendingClaimsUsdcRaw: number;
  treasuryUsdcRaw: number | null;
  pricePerToken: number;
  adminWallet: string | null;
  ts: number;
}

export interface FeeConfigResponse {
  adminWallet: string;
  purchaseFeeBps: number;
  claimFeeBps: number;
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
  cancelled: boolean;
  bunkercashEscrow: string;
  bunkercashRemaining: string;
  createdAt: string;
}

export interface ClaimsResponse {
  open: SerializedClaim[];
  closed: SerializedClaim[];
  totalRequestedUsdc: string;
  openCount: number;
  ts: number;
}

export interface SerializedEvent {
  id: string;
  type: string;
  time: number;
  wallet: string;
  amount: number | null;
  currency: "BNKR" | "USDC" | null;
  txHash: string;
}

export interface EventsResponse {
  events: SerializedEvent[];
  ts: number;
}

// ── Helpers ────────────────────────────────────────────

const BUNKERCASH_DECIMALS = 6;
const USDC_DECIMALS = 6;

function getRpcEndpoints(): string[] {
  const cluster = getConfiguredRpcCluster();
  const endpoints = [
    getServerRpcEndpoint(),
    clusterApiUrl(cluster),
    ...(cluster === "testnet" ? ["https://solana-testnet-rpc.publicnode.com"] : []),
  ];

  return [...new Set(endpoints.filter(Boolean))];
}

async function withConnectionFallback<T>(
  fn: (connection: Connection) => Promise<T>,
): Promise<T> {
  const errors: string[] = [];

  for (const endpoint of getRpcEndpoints()) {
    const connection = new Connection(endpoint, "confirmed");
    try {
      return await fn(connection);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${endpoint}: ${message}`);
    }
  }

  throw new Error(`All configured RPC endpoints failed. ${errors.join(" | ")}`);
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
    cancelled: claim.cancelled,
    bunkercashEscrow: claim.bunkercashEscrow,
    bunkercashRemaining: claim.bunkercashRemaining,
    createdAt: claim.createdAt,
  };
}

// ── Fetchers ───────────────────────────────────────────

export async function fetchPoolData(): Promise<PoolDataResponse> {
  return withConnectionFallback(async (connection) => {
    const cluster = getClusterFromEndpoint(connection.rpcEndpoint ?? "");
    const program = getReadonlyProgram(connection);
    const poolPda = getPoolPda(PROGRAM_ID);

    const accountApi = program.account as {
      pool: { fetch: (pubkey: PublicKey) => Promise<PoolAccountLike> };
    };

    const poolAccount = await accountApi.pool.fetch(poolPda);
    const totalSupplyRaw =
      Number(poolAccount.totalBunkercashSupply.toString()) / 10 ** BUNKERCASH_DECIMALS;
    const navUsdcRaw =
      Number(poolAccount.nav.toString()) / 10 ** USDC_DECIMALS;
    const pendingClaimsUsdcRaw =
      Number(poolAccount.totalPendingClaims.toString()) / 10 ** USDC_DECIMALS;
    const availableNavUsdcRaw = Math.max(navUsdcRaw - pendingClaimsUsdcRaw, 0);
    const tokenPrice = totalSupplyRaw > 0 ? availableNavUsdcRaw / totalSupplyRaw : 1;
    const adminWallet = poolAccount.masterWallet.toBase58();

    let treasuryUsdcRaw: number | null = null;
    try {
      const poolSignerPda = getPoolSignerPda(poolPda, PROGRAM_ID);
      let usdcMint: PublicKey | null = null;
      try {
        usdcMint = await fetchConfiguredUsdcMint(connection);
      } catch {
        // Ignore initial fetch errors, handled by fallback
      }

      if (!usdcMint && process.env.NEXT_PUBLIC_USDC_MINT && cluster !== "localnet") {
        usdcMint = new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT);
      }

      if (usdcMint) {
        const usdcTokenProgram = await fetchMintTokenProgram(connection, usdcMint);
        if (!usdcTokenProgram) {
          throw new Error("Unsupported configured USDC mint");
        }
        const payoutVault = getAssociatedTokenAddressSync(
          usdcMint,
          poolSignerPda,
          true,
          usdcTokenProgram,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );
        const bal = await connection.getTokenAccountBalance(payoutVault);
        treasuryUsdcRaw = bal.value.uiAmount ?? 0;
      }
    } catch {
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
  });
}

export async function fetchFeeConfig(): Promise<FeeConfigResponse> {
  return withConnectionFallback(async (connection) => {
    const program = getReadonlyProgram(connection);
    const poolPda = getPoolPda(PROGRAM_ID);
    const feeConfigPda = getFeeConfigPda(PROGRAM_ID);

    const accountApi = program.account as {
      pool: { fetch: (pubkey: PublicKey) => Promise<PoolAccountLike> };
      feeConfig?: { fetch: (pubkey: PublicKey) => Promise<FeeConfigAccountLike> };
    };

    const poolAccount = await accountApi.pool.fetch(poolPda);
    let purchaseFeeBps = 0;
    let claimFeeBps = 0;

    if (accountApi.feeConfig) {
      try {
        const feeConfig = await accountApi.feeConfig.fetch(feeConfigPda);
        purchaseFeeBps = Number(feeConfig.purchaseFeeBps.toString());
        claimFeeBps = Number(feeConfig.claimFeeBps.toString());
      } catch {
        purchaseFeeBps = 0;
        claimFeeBps = 0;
      }
    }

    return {
      adminWallet: poolAccount.masterWallet.toBase58(),
      purchaseFeeBps,
      claimFeeBps,
      ts: Date.now(),
    };
  });
}

export async function fetchAllClaims(): Promise<ClaimsResponse> {
  return withConnectionFallback(async (connection) => {
    const allClaims = await fetchDecodedClaimAccounts(connection);

    const open: SerializedClaim[] = [];
    const closed: SerializedClaim[] = [];
    let totalRequested = BigInt(0);

    for (const claim of allClaims) {
      const serialized = serializeClaim(claim);
      const remainingUsdc = BigInt(claim.remainingUsdc);
      if (claim.processed || claim.cancelled || remainingUsdc === BigInt(0)) {
        closed.push(serialized);
      } else {
        open.push(serialized);
        totalRequested += remainingUsdc;
      }
    }

    return {
      open,
      closed,
      totalRequestedUsdc: totalRequested.toString(),
      openCount: open.length,
      ts: Date.now(),
    };
  });
}

// ── Events fetcher ─────────────────────────────────────

const DISC_MAP: Record<string, { type: string; currency: "BNKR" | "USDC" | null; amountSource: string }> = {
  "184,148,250,169,224,213,34,126": { type: "Buy", currency: "USDC", amountSource: "ix_arg" },
  "187,254,40,13,146,223,230,97": { type: "File Claim", currency: "BNKR", amountSource: "ix_arg" },
  "58,91,9,15,201,59,179,94": { type: "Settlement", currency: "USDC", amountSource: "claims_settled_event" },
  "251,226,132,202,30,7,50,85": { type: "Master Withdraw", currency: "USDC", amountSource: "ix_arg" },
  "196,123,175,178,81,52,168,164": { type: "Master Repay", currency: "USDC", amountSource: "ix_arg" },
  "254,236,97,119,73,158,24,170": { type: "Master Cancel", currency: "USDC", amountSource: "ix_arg" },
};

const CLAIMS_SETTLED_EVENT_DISC = [88, 125, 52, 74, 137, 168, 85, 245];
const CLAIMS_SETTLED_TOTAL_PAID_OFFSET = 8 + 32 + 32 + 8 + 8 + 8; // 96
const BNKR_DECIMALS = 6;

function decodeU64LE(bytes: Uint8Array, offset: number): bigint {
  let value = BigInt(0);
  for (let i = 0; i < 8 && offset + i < bytes.length; i++) {
    value += BigInt(bytes[offset + i]!) << BigInt(8 * i);
  }
  return value;
}

function parseBase64Log(log: string): Uint8Array | null {
  if (!log.startsWith("Program data: ")) return null;
  try {
    const b64 = log.slice("Program data: ".length);
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function parseClaimsSettledAmount(logMessages: string[] | null | undefined): number | null {
  if (!logMessages) return null;
  for (const log of logMessages) {
    const bytes = parseBase64Log(log);
    if (!bytes || bytes.length < CLAIMS_SETTLED_TOTAL_PAID_OFFSET + 8) continue;
    const discMatch = CLAIMS_SETTLED_EVENT_DISC.every((b, i) => bytes[i] === b);
    if (!discMatch) continue;
    const raw = decodeU64LE(bytes, CLAIMS_SETTLED_TOTAL_PAID_OFFSET);
    return Number(raw) / 10 ** USDC_DECIMALS;
  }
  return null;
}

export async function fetchRecentEvents(limit = 20): Promise<EventsResponse> {
  return withConnectionFallback(async (connection) => {
    const programIdStr = PROGRAM_ID.toBase58();

    const sigs = await connection.getSignaturesForAddress(PROGRAM_ID, { limit });
    if (sigs.length === 0) {
      return { events: [], ts: Date.now() };
    }

    const events: SerializedEvent[] = [];
    const BATCH = 5;

    for (let start = 0; start < sigs.length; start += BATCH) {
      const batch = sigs.slice(start, start + BATCH);

      let txs: (import("@solana/web3.js").VersionedTransactionResponse | null)[];
      try {
        txs = await connection.getTransactions(
          batch.map((s) => s.signature),
          { commitment: "confirmed", maxSupportedTransactionVersion: 0 },
        );
      } catch {
        continue;
      }

      for (let i = 0; i < batch.length; i++) {
        const sig = batch[i]!;
        const tx = txs[i];
        if (!tx) continue;

        const timestamp = sig.blockTime ? sig.blockTime * 1000 : Date.now();
        const msg = tx.transaction.message;
        const accountKeys = msg.staticAccountKeys;
        const instructions = msg.compiledInstructions;
        const defaultWallet = accountKeys[0]?.toBase58() ?? "unknown";

        for (const ix of instructions) {
          const ixProgramId = accountKeys[ix.programIdIndex]?.toBase58();
          if (ixProgramId !== programIdStr) continue;
          const data = ix.data;
          if (data.length < 8) continue;

          const discKey = Array.from(data.slice(0, 8)).join(",");
          const info = DISC_MAP[discKey];
          if (!info) continue;

          let amount: number | null = null;
          if (info.amountSource === "ix_arg" && data.length >= 16) {
            const raw = decodeU64LE(data, 8);
            const decimals = info.currency === "BNKR" ? BNKR_DECIMALS : USDC_DECIMALS;
            amount = Number(raw) / 10 ** decimals;
          } else if (info.amountSource === "claims_settled_event") {
            amount = parseClaimsSettledAmount(tx.meta?.logMessages);
          }

          events.push({
            id: `${sig.signature}-${events.length}`,
            type: info.type,
            time: timestamp,
            wallet: defaultWallet,
            amount,
            currency: info.currency,
            txHash: sig.signature,
          });
        }
      }
    }

    return { events, ts: Date.now() };
  });
}
