import { PublicKey } from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { getPoolPda, getPoolSignerPda, getProgram, getReadonlyProgram, PROGRAM_ID } from "@/lib/program";

const MASTER_OPS_SEED = Buffer.from("bunkercash_master_ops");
const MASTER_WITHDRAWAL_SEED = Buffer.from("bunkercash_master_withdrawal");

function encodeU64Le(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  let remaining = value;

  for (let i = 0; i < 8; i += 1) {
    bytes[i] = Number(remaining & BigInt(0xff));
    remaining >>= BigInt(8);
  }

  return bytes;
}

export const MASTER_PROGRAM_ID = PROGRAM_ID;

export function getMasterProgram(connection: Connection, wallet: WalletContextState) {
  return getProgram(connection, wallet);
}

export function getReadonlyMasterProgram(connection: Connection) {
  return getReadonlyProgram(connection);
}

export function getMasterPoolPda(programId: PublicKey = MASTER_PROGRAM_ID): PublicKey {
  return getPoolPda(programId);
}

export function getMasterPoolSignerPda(programId: PublicKey = MASTER_PROGRAM_ID): PublicKey {
  return getPoolSignerPda(getMasterPoolPda(programId), programId);
}

export function getMasterOpsPda(programId: PublicKey = MASTER_PROGRAM_ID): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [MASTER_OPS_SEED, getMasterPoolPda(programId).toBuffer()],
    programId
  );
  return pda;
}

export function getMasterWithdrawalPda(
  withdrawalId: bigint,
  programId: PublicKey = MASTER_PROGRAM_ID
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      MASTER_WITHDRAWAL_SEED,
      getMasterPoolPda(programId).toBuffer(),
      encodeU64Le(withdrawalId),
    ],
    programId
  );
  return pda;
}
