import { PublicKey } from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";
import { getPoolPda, getPoolSignerPda, getProgram, getReadonlyProgram, PROGRAM_ID, type ProgramWallet } from "@/lib/program";

const MASTER_WITHDRAWAL_SEED = Buffer.from("withdrawal");

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

interface PoolAccountLike {
  withdrawalCounter: { toString(): string };
}

export function getMasterProgram(connection: Connection, wallet: ProgramWallet) {
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

export function getMasterWithdrawalPda(
  withdrawalId: bigint,
  programId: PublicKey = MASTER_PROGRAM_ID
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      MASTER_WITHDRAWAL_SEED,
      encodeU64Le(withdrawalId),
    ],
    programId
  );
  return pda;
}

export async function getNextMasterWithdrawalPda(
  connection: Connection,
  programId: PublicKey = MASTER_PROGRAM_ID,
): Promise<PublicKey> {
  const program = getReadonlyMasterProgram(connection);
  const poolPda = getMasterPoolPda(programId);
  const accountApi = program.account as {
    pool: { fetch: (pubkey: typeof poolPda) => Promise<PoolAccountLike> };
  };
  const pool = await accountApi.pool.fetch(poolPda);
  return getMasterWithdrawalPda(
    BigInt(pool.withdrawalCounter.toString()),
    programId,
  );
}
