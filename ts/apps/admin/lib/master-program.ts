import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";

const masterIdl = {
  address: "84sMb85TrcfSrx1FVSfYk78PHqei9gDiZ3kJ7UKihx3X",
  metadata: {
    name: "bunkercash",
    version: "0.1.0",
    spec: "0.1.0",
    description: "Historical master-withdraw program surface",
  },
  instructions: [
    {
      name: "master_cancel_withdrawal",
      discriminator: [254, 236, 97, 119, 73, 158, 24, 170],
      accounts: [
        { name: "pool", writable: true },
        { name: "withdrawal", writable: true },
        { name: "master_usdc", writable: true },
        { name: "pool_usdc", writable: true },
        { name: "usdc_mint" },
        { name: "master_wallet", signer: true },
        {
          name: "token_program",
          address: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
        },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
    {
      name: "master_repay",
      discriminator: [196, 123, 175, 178, 81, 52, 168, 164],
      accounts: [
        { name: "pool", writable: true },
        { name: "withdrawal", writable: true },
        { name: "master_usdc", writable: true },
        { name: "pool_usdc", writable: true },
        { name: "usdc_mint" },
        { name: "master_wallet", signer: true },
        {
          name: "token_program",
          address: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
        },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
    {
      name: "master_withdraw",
      discriminator: [251, 226, 132, 202, 30, 7, 50, 85],
      accounts: [
        { name: "pool", writable: true },
        { name: "withdrawal", writable: true },
        { name: "pool_usdc", writable: true },
        { name: "master_usdc", writable: true },
        { name: "usdc_mint" },
        { name: "master_wallet", writable: true, signer: true },
        {
          name: "token_program",
          address: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
        },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "amount", type: "u64" },
        { name: "metadata_hash", type: { array: ["u8", 32] } },
      ],
    },
  ],
  accounts: [
    {
      name: "Pool",
      discriminator: [241, 154, 109, 4, 17, 177, 109, 188],
    },
    {
      name: "Withdrawal",
      discriminator: [10, 45, 211, 182, 129, 235, 90, 82],
    },
  ],
  types: [
    {
      name: "Pool",
      type: {
        kind: "struct",
        fields: [
          { name: "master_wallet", type: "pubkey" },
          { name: "nav", type: "u64" },
          { name: "total_brent_supply", type: "u64" },
          { name: "total_pending_claims", type: "u64" },
          { name: "claim_counter", type: "u64" },
          { name: "withdrawal_counter", type: "u64" },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "Withdrawal",
      type: {
        kind: "struct",
        fields: [
          { name: "id", type: "u64" },
          { name: "amount", type: "u64" },
          { name: "remaining", type: "u64" },
          { name: "metadata_hash", type: { array: ["u8", 32] } },
          { name: "timestamp", type: "i64" },
          { name: "bump", type: "u8" },
        ],
      },
    },
  ],
} as unknown as Idl & { address: string };

const MASTER_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_MASTER_PROGRAM_ID ?? masterIdl.address
);

export type MasterProgramIdl = Idl;

type SignableTransaction = Transaction | VersionedTransaction;

type AnchorWalletLike = {
  publicKey: PublicKey;
  signTransaction: <T extends SignableTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends SignableTransaction>(txs: T[]) => Promise<T[]>;
};

function createProvider(connection: Connection, wallet: AnchorWalletLike) {
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

function encodeU64Le(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  let remaining = value;

  for (let i = 0; i < 8; i += 1) {
    bytes[i] = Number(remaining & BigInt(0xff));
    remaining >>= BigInt(8);
  }

  return bytes;
}

export function getMasterProgram(
  connection: Connection,
  wallet: WalletContextState
): Program<Idl> | null {
  if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
    return null;
  }

  const provider = createProvider(connection, {
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction.bind(wallet),
    signAllTransactions: wallet.signAllTransactions.bind(wallet),
  });

  return new Program(masterIdl as Idl, provider);
}

export function getReadonlyMasterProgram(connection: Connection): Program<Idl> {
  const provider = createProvider(connection, {
    publicKey: PublicKey.default,
    signTransaction: async <T extends SignableTransaction>(tx: T) => tx,
    signAllTransactions: async <T extends SignableTransaction>(txs: T[]) => txs,
  });

  return new Program(masterIdl as Idl, provider);
}

export function getMasterPoolPda(
  programId: PublicKey = MASTER_PROGRAM_ID
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("pool")], programId);
  return pda;
}

export function getMasterWithdrawalPda(
  withdrawalId: bigint,
  programId: PublicKey = MASTER_PROGRAM_ID
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("withdrawal"), encodeU64Le(withdrawalId)],
    programId
  );
  return pda;
}

export { MASTER_PROGRAM_ID, masterIdl };
