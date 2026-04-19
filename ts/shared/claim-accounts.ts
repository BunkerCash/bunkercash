import { Buffer } from "buffer";
import { Connection, PublicKey } from "@solana/web3.js";

const CLAIM_CURRENT_SIZE = 83;
const CLAIM_DISCRIMINATOR = Buffer.from([155, 70, 22, 176, 123, 215, 246, 102]);

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

  const user = new PublicKey(data.slice(8, 40));
  const requestedRaw = readU64Le(data, 40);
  const createdAt = readI64Le(data, 48);
  const processedFlag = data[56] === 1;
  const paidRaw = readU64Le(data, 57);
  const bunkercashEscrowRaw = readU64Le(data, 65);
  const bunkercashRemainingRaw = readU64Le(data, 73);
  const cancelled = data[81] === 1;

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
