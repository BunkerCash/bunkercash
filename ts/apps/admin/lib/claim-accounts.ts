import { Buffer } from "buffer";
import { Connection, PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "@/lib/program";

const CLAIM_CURRENT_SIZE = 66;
const CLAIM_LEGACY_SIZE = 74;
const CLAIM_DISCRIMINATOR = Buffer.from([155, 70, 22, 176, 123, 215, 246, 102]);

export interface DecodedClaimAccount {
  pubkey: PublicKey;
  id: string;
  user: PublicKey;
  requestedUsdc: string;
  paidUsdc: string;
  remainingUsdc: string;
  processed: boolean;
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
  if (!hasClaimDiscriminator(data)) return null;

  let id = pubkey.toBase58().slice(0, 8);
  let userOffset = 8;
  let requestedOffset = 40;
  let timestampOffset = 48;
  let processedOffset = 56;
  let paidOffset = 57;

  if (data.length === CLAIM_LEGACY_SIZE) {
    id = readU64Le(data, 8).toString();
    userOffset = 16;
    requestedOffset = 48;
    timestampOffset = 56;
    processedOffset = 64;
    paidOffset = 65;
  } else if (data.length !== CLAIM_CURRENT_SIZE) {
    return null;
  }

  const user = new PublicKey(data.slice(userOffset, userOffset + 32));
  const requestedRaw = readU64Le(data, requestedOffset);
  const paidRaw = readU64Le(data, paidOffset);
  const remainingRaw = requestedRaw > paidRaw ? requestedRaw - paidRaw : BigInt(0);
  const processed = data[processedOffset] === 1 || remainingRaw === BigInt(0);

  return {
    pubkey,
    id,
    user,
    requestedUsdc: requestedRaw.toString(),
    paidUsdc: paidRaw.toString(),
    remainingUsdc: remainingRaw.toString(),
    processed,
    createdAt: readI64Le(data, timestampOffset).toString(),
  };
}

export async function fetchDecodedClaimAccounts(connection: Connection): Promise<DecodedClaimAccount[]> {
  const fetchBySize = (dataSize: number) =>
    connection.getProgramAccounts(PROGRAM_ID, {
      commitment: "confirmed",
      filters: [{ dataSize }],
    });

  const [currentClaims, legacyClaims] = await Promise.all([
    fetchBySize(CLAIM_CURRENT_SIZE),
    fetchBySize(CLAIM_LEGACY_SIZE),
  ]);

  return [...currentClaims, ...legacyClaims]
    .map(({ pubkey, account }) => decodeClaimAccount(pubkey, account.data))
    .filter((claim): claim is DecodedClaimAccount => claim !== null)
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}
