import { Buffer } from "buffer";
import { Connection, PublicKey } from "@solana/web3.js";

const CLAIM_CURRENT_SIZE = 83;
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
  if (!hasClaimDiscriminator(data) || data.length !== CLAIM_CURRENT_SIZE) return null;

  // Claim account byte layout, matching the current Rust struct exactly:
  // 0..8   discriminator
  // 8..40  user: Pubkey
  // 40..48 requested_usdc: u64
  // 48..56 created_at: i64
  // 56     processed: bool
  // 57..65 paid_usdc: u64
  // 65..73 bunkercash_escrow: u64
  // 73..81 bunkercash_remaining: u64
  // 81     cancelled: bool
  // 82     trailing bool padding from the current Rust layout
  const user = new PublicKey(data.slice(CLAIM_LAYOUT.user, CLAIM_LAYOUT.requestedUsdc));
  const requestedRaw = readU64Le(data, CLAIM_LAYOUT.requestedUsdc);
  const createdAt = readI64Le(data, CLAIM_LAYOUT.createdAt);
  const processedFlag = data[CLAIM_LAYOUT.processed] === 1;
  const paidRaw = readU64Le(data, CLAIM_LAYOUT.paidUsdc);
  const bunkercashEscrowRaw = readU64Le(data, CLAIM_LAYOUT.bunkercashEscrow);
  const bunkercashRemainingRaw = readU64Le(data, CLAIM_LAYOUT.bunkercashRemaining);
  const cancelled = data[CLAIM_LAYOUT.cancelled] === 1;

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
  };
}

export async function fetchDecodedClaimAccountsForProgram(
  connection: Connection,
  programId: PublicKey,
): Promise<DecodedClaimAccount[]> {
  const claims = await connection.getProgramAccounts(programId, {
    commitment: "confirmed",
    filters: [{ dataSize: CLAIM_CURRENT_SIZE }],
  });

  return claims
    .map(({ pubkey, account }) => decodeClaimAccount(pubkey, account.data))
    .filter((claim): claim is DecodedClaimAccount => claim !== null)
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}
