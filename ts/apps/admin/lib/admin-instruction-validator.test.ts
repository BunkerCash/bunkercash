import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { PROGRAM_ID, getFeeConfigPda, getPoolPda } from "./program";
import { validateAdminInstructions, type SerializedAdminInstruction } from "./admin-instruction-validator";
import type { AdminIdentity } from "./geoblocking-auth";

function discriminator(name: string): Buffer {
  return createHash("sha256")
    .update(`global:${name}`)
    .digest()
    .subarray(0, 8);
}

function setFeeConfigData(purchaseFeeBps = 100, claimFeeBps = 100): string {
  const data = Buffer.alloc(12);
  discriminator("set_fee_config").copy(data, 0);
  data.writeUInt16LE(purchaseFeeBps, 8);
  data.writeUInt16LE(claimFeeBps, 10);
  return data.toString("base64");
}

function updateMasterWalletData(newMasterWallet: string): string {
  const data = Buffer.alloc(40);
  discriminator("update_master_wallet").copy(data, 0);
  Buffer.from(new PublicKey(newMasterWallet).toBytes()).copy(data, 8);
  return data.toString("base64");
}

const vault = Keypair.generate().publicKey;
const identity: AdminIdentity = {
  wallet: Keypair.generate().publicKey.toBase58(),
  isAdmin: true,
  role: "squads-member",
  governanceMode: "squads-v4",
  poolMasterWallet: vault.toBase58(),
  squadsMultisig: Keypair.generate().publicKey.toBase58(),
  squadsVault: vault.toBase58(),
  squadsVaultIndex: 0,
  squadsPermissions: ["vote"],
};

function setFeeConfigIx(overrides: Partial<SerializedAdminInstruction> = {}): SerializedAdminInstruction {
  return {
    programId: PROGRAM_ID.toBase58(),
    data: setFeeConfigData(),
    keys: [
      { pubkey: getPoolPda(PROGRAM_ID).toBase58(), isSigner: false, isWritable: true },
      { pubkey: getFeeConfigPda(PROGRAM_ID).toBase58(), isSigner: false, isWritable: true },
      { pubkey: vault.toBase58(), isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
    ],
    ...overrides,
  };
}

function updateMasterWalletIx(newMasterWallet = Keypair.generate().publicKey.toBase58()): SerializedAdminInstruction {
  return {
    programId: PROGRAM_ID.toBase58(),
    data: updateMasterWalletData(newMasterWallet),
    keys: [
      { pubkey: getPoolPda(PROGRAM_ID).toBase58(), isSigner: false, isWritable: true },
      { pubkey: vault.toBase58(), isSigner: true, isWritable: false },
    ],
  };
}

describe("admin instruction validator", () => {
  it("decodes allowed BunkerCash instructions for review", () => {
    expect(validateAdminInstructions([setFeeConfigIx()], identity)).toEqual([
      expect.objectContaining({
        programId: PROGRAM_ID.toBase58(),
        instruction: "set_fee_config",
        args: { purchaseFeeBps: 100, claimFeeBps: 100 },
        accounts: expect.arrayContaining([
          { name: "pool", pubkey: getPoolPda(PROGRAM_ID).toBase58() },
          { name: "admin", pubkey: vault.toBase58() },
        ]),
      }),
    ]);
  });

  it("blocks unknown program ids", () => {
    expect(() =>
      validateAdminInstructions(
        [setFeeConfigIx({ programId: Keypair.generate().publicKey.toBase58() })],
        identity,
      ),
    ).toThrow("Unknown admin instruction program id");
  });

  it("decodes master wallet rotation proposals gated by the current vault", () => {
    const newMasterWallet = Keypair.generate().publicKey.toBase58();

    expect(validateAdminInstructions([updateMasterWalletIx(newMasterWallet)], identity)).toEqual([
      expect.objectContaining({
        instruction: "update_master_wallet",
        args: { newMasterWallet },
        accounts: expect.arrayContaining([
          { name: "pool", pubkey: getPoolPda(PROGRAM_ID).toBase58() },
          { name: "current_master_wallet", pubkey: vault.toBase58() },
        ]),
      }),
    ]);
  });

  it("blocks unknown instruction discriminators", () => {
    expect(() =>
      validateAdminInstructions(
        [setFeeConfigIx({ data: Buffer.alloc(8, 1).toString("base64") })],
        identity,
      ),
    ).toThrow("Unknown BunkerCash instruction discriminator");
  });

  it("blocks wrong pool PDA", () => {
    const ix = setFeeConfigIx();
    ix.keys[0] = {
      ...ix.keys[0],
      pubkey: Keypair.generate().publicKey.toBase58(),
    };
    expect(() => validateAdminInstructions([ix], identity)).toThrow("wrong pool PDA");
  });

  it("blocks wrong Squads vault authority", () => {
    const ix = setFeeConfigIx();
    ix.keys[2] = {
      ...ix.keys[2],
      pubkey: Keypair.generate().publicKey.toBase58(),
    };
    expect(() => validateAdminInstructions([ix], identity)).toThrow("wrong admin");
  });

  it("blocks fee changes outside configured bounds", () => {
    expect(() =>
      validateAdminInstructions(
        [setFeeConfigIx({ data: setFeeConfigData(1_001, 100) })],
        identity,
      ),
    ).toThrow("outside allowed bounds");
  });
});
