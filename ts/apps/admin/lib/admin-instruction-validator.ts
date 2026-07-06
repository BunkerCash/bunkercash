import { createHash } from "crypto";
import { PublicKey } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import idlJson from "./bunkercash.fixed.idl.json";
import { PROGRAM_ID, getPoolPda } from "./program";
import type { AdminIdentity } from "./geoblocking-auth";

const ALLOWED_BUNKERCASH_INSTRUCTIONS = new Set([
  "create_bunkercash_mint",
  "init_mint_metadata",
  "update_mint_metadata",
  "open_settlement",
  "settle_claims",
  "close_settlement",
  "master_withdraw",
  "master_repay",
  "master_profit",
  "master_close_withdrawal",
  "set_fee_config",
  "set_purchase_limit",
  "reset_purchase_counter",
  "set_min_claim_usdc",
  "set_min_settlement_usdc",
  "set_supported_usdc_mint",
  "update_master_wallet",
]);

interface SerializedAccountMeta {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

export interface SerializedAdminInstruction {
  programId: string;
  keys: SerializedAccountMeta[];
  data: string;
}

interface IdlInstructionAccount {
  name: string;
  accounts?: IdlInstructionAccount[];
}

interface IdlInstruction {
  name: string;
  accounts?: IdlInstructionAccount[];
}

export interface DecodedAdminInstruction {
  programId: string;
  instruction: string;
  args: Record<string, string | number>;
  accounts: Array<{ name: string; pubkey: string }>;
}

function discriminator(name: string): string {
  return createHash("sha256")
    .update(`global:${name}`)
    .digest()
    .subarray(0, 8)
    .toString("hex");
}

const idlInstructions = new Map(
  ((idlJson as { instructions: IdlInstruction[] }).instructions ?? []).map((ix) => [
    ix.name,
    ix,
  ]),
);

const discriminators = new Map(
  [...ALLOWED_BUNKERCASH_INSTRUCTIONS].map((name) => [discriminator(name), name]),
);

function flattenAccounts(accounts: IdlInstructionAccount[] = []): string[] {
  return accounts.flatMap((account) =>
    account.accounts?.length ? flattenAccounts(account.accounts) : [account.name],
  );
}

function decodeInstructionData(data: string): Buffer {
  return Buffer.from(data, "base64");
}

function readU16(data: Buffer, offset: number): number {
  if (data.length < offset + 2) throw new Error("Instruction data is truncated");
  return data.readUInt16LE(offset);
}

function readU64String(data: Buffer, offset: number): string {
  if (data.length < offset + 8) throw new Error("Instruction data is truncated");
  return data.readBigUInt64LE(offset).toString();
}

function readPubkeyString(data: Buffer, offset: number): string {
  if (data.length < offset + 32) throw new Error("Instruction data is truncated");
  return new PublicKey(data.subarray(offset, offset + 32)).toBase58();
}

function decodeAndValidateArgs(name: string, data: Buffer): Record<string, string | number> {
  switch (name) {
    case "set_fee_config": {
      const purchaseFeeBps = readU16(data, 8);
      const claimFeeBps = readU16(data, 10);
      if (purchaseFeeBps > 1_000 || claimFeeBps > 1_000) {
        throw new Error("Fee configuration is outside allowed bounds");
      }
      return { purchaseFeeBps, claimFeeBps };
    }
    case "set_purchase_limit":
      return { amount: readU64String(data, 8) };
    case "set_min_claim_usdc":
    case "set_min_settlement_usdc":
      return { amount: readU64String(data, 8) };
    case "master_withdraw":
    case "master_repay":
    case "master_profit":
    case "master_close_withdrawal":
      return { amount: readU64String(data, 8) };
    case "update_master_wallet":
      return { newMasterWallet: readPubkeyString(data, 8) };
    default:
      return {};
  }
}

function requirePubkey(value: string, label: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${label} is not a valid public key`);
  }
}

function expectedAuthority(identity: AdminIdentity): string {
  if (identity.governanceMode === "squads-v4") {
    if (!identity.squadsVault) {
      throw new Error("Squads vault is required for Squads admin validation");
    }
    return identity.squadsVault;
  }
  return identity.poolMasterWallet;
}

function validateBunkercashInstruction(
  instruction: SerializedAdminInstruction,
  identity: AdminIdentity,
): DecodedAdminInstruction {
  const data = decodeInstructionData(instruction.data);
  if (data.length < 8) {
    throw new Error("BunkerCash instruction data is missing discriminator");
  }

  const name = discriminators.get(data.subarray(0, 8).toString("hex"));
  if (!name) {
    throw new Error("Unknown BunkerCash instruction discriminator");
  }

  const idlInstruction = idlInstructions.get(name);
  if (!idlInstruction) {
    throw new Error(`BunkerCash instruction ${name} is missing from IDL`);
  }

  const accountNames = flattenAccounts(idlInstruction.accounts);
  const decodedAccounts = instruction.keys.map((meta, index) => ({
    name: accountNames[index] ?? `remaining_${index - accountNames.length}`,
    pubkey: requirePubkey(meta.pubkey, "instruction account").toBase58(),
  }));

  const byName = new Map(decodedAccounts.map((account) => [account.name, account.pubkey]));
  const pool = byName.get("pool");
  if (pool && pool !== getPoolPda(PROGRAM_ID).toBase58()) {
    throw new Error("BunkerCash instruction targets the wrong pool PDA");
  }

  const authority = expectedAuthority(identity);
  for (const authorityName of ["admin", "master_wallet", "masterWallet", "current_master_wallet"]) {
    const pubkey = byName.get(authorityName);
    if (pubkey && pubkey !== authority) {
      throw new Error(`BunkerCash instruction uses wrong ${authorityName}`);
    }
  }

  const args = decodeAndValidateArgs(name, data);

  return {
    programId: PROGRAM_ID.toBase58(),
    instruction: name,
    args,
    accounts: decodedAccounts,
  };
}

function validateAssociatedTokenInstruction(
  instruction: SerializedAdminInstruction,
): DecodedAdminInstruction {
  if (instruction.keys.length < 4) {
    throw new Error("Associated token instruction has too few accounts");
  }

  return {
    programId: ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
    instruction: "associated_token_account",
    args: {},
    accounts: instruction.keys.map((meta, index) => ({
      name: ["payer", "associatedAccount", "owner", "mint"][index] ?? `account_${index}`,
      pubkey: requirePubkey(meta.pubkey, "associated token account").toBase58(),
    })),
  };
}

export function validateAdminInstructions(
  instructions: SerializedAdminInstruction[],
  identity: AdminIdentity,
): DecodedAdminInstruction[] {
  if (!identity.isAdmin) {
    throw new Error("Connected wallet is not authorized");
  }
  if (instructions.length === 0) {
    throw new Error("No admin instructions provided");
  }

  return instructions.map((instruction) => {
    const programId = requirePubkey(instruction.programId, "instruction program id").toBase58();
    if (programId === PROGRAM_ID.toBase58()) {
      return validateBunkercashInstruction(instruction, identity);
    }
    if (programId === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()) {
      return validateAssociatedTokenInstruction(instruction);
    }
    throw new Error(`Unknown admin instruction program id: ${programId}`);
  });
}
