import { Buffer } from "buffer";
import { Connection, PublicKey } from "@solana/web3.js";

const CLAIM_CURRENT_SIZE = 99;
// Pre-epoch-fields layouts that may still exist on chain until the
// migrate_claim instruction has been run for every old account:
//  - 83 bytes: original layout (no epoch fields)
//  - 91 bytes: interim layout with `last_settled_epoch: i64` at offset 82
// Both share the current layout's byte offsets up through `cancelled` (81),
// so they decode with the same prefix reads; their epoch sequences are
// reported as 0 and the claim is flagged `needsMigration`.
const CLAIM_LEGACY_SIZES = [83, 91] as const;
const CLAIM_ALL_SIZES = [CLAIM_CURRENT_SIZE, ...CLAIM_LEGACY_SIZES] as const;
const CLAIM_DISCRIMINATOR = Buffer.from([155, 70, 22, 176, 123, 215, 246, 102]);
const CLAIM_LAYOUT = {
  discriminator: 0,
  user: 8,
  requestedUsdc: 40,
  createdAt: 48,
  processed: 56,
  paidUsdc: 57,
  bunkercashEscrow: 65,
  bunkercashRemaining: 73,
  cancelled: 81,
  lastSettledEpochSeq: 82,
  lastPaidEpochSeq: 90,
} as const;

export interface DecodedClaimAccount {
  pubkey: PublicKey;
  id: string;
  user: PublicKey;
  requestedUsdc: string;
  paidUsdc: string;
  remainingUsdc: string;
  processed: boolean;
  cancelled: boolean;
  bunkercashEscrow: string;
  bunkercashRemaining: string;
  createdAt: string;
  lastSettledEpochSeq: string;
  lastPaidEpochSeq: string;
  /** True when the account still uses a pre-epoch-fields layout and must be
   *  migrated on chain (migrate_claim) before it can settle or cancel. */
  needsMigration: boolean;
}

function readU64Le(data: Uint8Array, offset: number): bigint {
  let value = BigInt(0);
  for (let i = 0; i < 8; i += 1) {
    value |= BigInt(data[offset + i] ?? 0) << BigInt(8 * i);
  }
  return value;
}

function readI64Le(data: Uint8Array, offset: number): bigint {
  const value = readU64Le(data, offset);
  return value >= (BigInt(1) << BigInt(63)) ? value - (BigInt(1) << BigInt(64)) : value;
}

function hasClaimDiscriminator(data: Uint8Array): boolean {
  if (data.length < 8) return false;
  for (let i = 0; i < 8; i += 1) {
    if (data[i] !== CLAIM_DISCRIMINATOR[i]) return false;
  }
  return true;
}

function decodeClaimAccount(pubkey: PublicKey, data: Uint8Array): DecodedClaimAccount | null {
  if (!hasClaimDiscriminator(data)) return null;
  const isCurrentLayout = data.length === CLAIM_CURRENT_SIZE;
  const isLegacyLayout = (CLAIM_LEGACY_SIZES as readonly number[]).includes(data.length);
  if (!isCurrentLayout && !isLegacyLayout) return null;

  // Claim account byte layout, matching the current Rust struct exactly:
  // 0..8   discriminator
  // 8..40  user: Pubkey
  // 40..48 requested_usdc: u64
  // 48..56 timestamp: i64           (immutable filing time -> createdAt)
  // 56     processed: bool
  // 57..65 paid_usdc: u64
  // 65..73 bunkercash_escrow: u64
  // 73..81 bunkercash_remaining: u64
  // 81     cancelled: bool
  // 82..90 last_settled_epoch_seq: u64  (anti-replay epoch sequence)
  // 90..98 last_paid_epoch_seq: u64    (cancel guard; 0 until first non-zero payout)
  // 98     bump: u8
  // Legacy layouts share offsets 0..82; their epoch sequences read as 0.
  const user = new PublicKey(data.slice(CLAIM_LAYOUT.user, CLAIM_LAYOUT.requestedUsdc));
  const requestedRaw = readU64Le(data, CLAIM_LAYOUT.requestedUsdc);
  const createdAt = readI64Le(data, CLAIM_LAYOUT.createdAt);
  const processedFlag = data[CLAIM_LAYOUT.processed] === 1;
  const paidRaw = readU64Le(data, CLAIM_LAYOUT.paidUsdc);
  const bunkercashEscrowRaw = readU64Le(data, CLAIM_LAYOUT.bunkercashEscrow);
  const bunkercashRemainingRaw = readU64Le(data, CLAIM_LAYOUT.bunkercashRemaining);
  const cancelled = data[CLAIM_LAYOUT.cancelled] === 1;
  const lastSettledEpochSeq = isCurrentLayout
    ? readU64Le(data, CLAIM_LAYOUT.lastSettledEpochSeq)
    : BigInt(0);
  const lastPaidEpochSeq = isCurrentLayout
    ? readU64Le(data, CLAIM_LAYOUT.lastPaidEpochSeq)
    : BigInt(0);

  const remainingRaw = requestedRaw > paidRaw ? requestedRaw - paidRaw : BigInt(0);
  const processed = processedFlag || remainingRaw === BigInt(0);

  return {
    pubkey,
    id: pubkey.toBase58().slice(0, 8),
    user,
    requestedUsdc: requestedRaw.toString(),
    paidUsdc: paidRaw.toString(),
    remainingUsdc: remainingRaw.toString(),
    processed,
    cancelled,
    bunkercashEscrow: bunkercashEscrowRaw.toString(),
    bunkercashRemaining: bunkercashRemainingRaw.toString(),
    createdAt: createdAt.toString(),
    lastSettledEpochSeq: lastSettledEpochSeq.toString(),
    lastPaidEpochSeq: lastPaidEpochSeq.toString(),
    needsMigration: isLegacyLayout,
  };
}

export async function fetchDecodedClaimAccountsForProgram(
  connection: Connection,
  programId: PublicKey,
): Promise<DecodedClaimAccount[]> {
  // Query every known claim size (current + legacy) so claims that have not
  // been migrated yet still show up in coverage analysis instead of
  // silently disappearing.
  const responses = await Promise.all(
    CLAIM_ALL_SIZES.map((dataSize) =>
      connection.getProgramAccounts(programId, {
        commitment: "confirmed",
        filters: [{ dataSize }],
      }),
    ),
  );

  return responses
    .flat()
    .map(({ pubkey, account }) => decodeClaimAccount(pubkey, account.data))
    .filter((claim): claim is DecodedClaimAccount => claim !== null)
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}

export interface ClaimCoverageReport {
  claimCounter: bigint;
  discoveredCount: number;
  activeCount: number;
  /** Claims still on a legacy layout that require on-chain migration. */
  needsMigrationCount: number;
  totalRemainingUsdc: bigint;
  poolTotalPendingClaims: bigint;
  /** pool.total_pending_claims minus sum of active claim remainders; positive = pool tracks more, negative = decoded claims exceed pool */
  pendingDrift: bigint;
}

export function analyzeClaimCoverage(
  claims: DecodedClaimAccount[],
  claimCounter: bigint,
  poolTotalPendingClaims: bigint,
): ClaimCoverageReport {
  const activeClaims = claims.filter((c) => !c.cancelled && !c.processed);
  const totalRemainingUsdc = activeClaims.reduce(
    (sum, c) => sum + BigInt(c.remainingUsdc),
    BigInt(0),
  );
  const pendingDrift = poolTotalPendingClaims - totalRemainingUsdc;

  return {
    claimCounter,
    discoveredCount: claims.length,
    activeCount: activeClaims.length,
    needsMigrationCount: claims.filter((c) => c.needsMigration).length,
    totalRemainingUsdc,
    poolTotalPendingClaims,
    pendingDrift,
  };
}
