"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  getMasterPoolPda,
  getReadonlyMasterProgram,
  getMasterProgram,
} from "@/lib/master-program";
import { withRateLimitRetry } from "@/lib/rpc-throttle";

export interface MasterPoolState {
  masterWallet: PublicKey;
  nav: string;
  totalBrentSupply: string;
  totalPendingClaims: string;
  claimCounter: string;
  withdrawalCounter: string;
}

export interface MasterWithdrawal {
  pubkey: PublicKey;
  id: string;
  amount: string;
  remaining: string;
  returned: string;
  metadataHash: number[];
  createdAt: string;
}

interface Stringable {
  toString(): string;
}


interface RawMasterWithdrawalRecord {
  publicKey: PublicKey;
  account: {
    id: Stringable;
    amount: Stringable;
    remaining: Stringable;
    metadataHash: Iterable<number>;
    timestamp: Stringable;
  };
}

const CACHE_TTL = 30_000;
const POOL_ACCOUNT_DISCRIMINATOR = 8;
const MASTER_REPAY_DISC = "196,123,175,178,81,52,168,164";
const MASTER_CANCEL_DISC = "254,236,97,119,73,158,24,170";
const RETURN_SCAN_SIGNATURE_LIMIT = 250;

function readU64Le(data: Uint8Array, offset: number): string {
  let value = BigInt(0);
  for (let i = 0; i < 8; i += 1) {
    value |= BigInt(data[offset + i] ?? 0) << BigInt(8 * i);
  }
  return value.toString();
}

function decodePoolAccount(data: Uint8Array): MasterPoolState {
  if (data.length < POOL_ACCOUNT_DISCRIMINATOR + 32 + 8 * 5 + 1) {
    throw new Error(`Unexpected pool account length: ${data.length}`);
  }

  return {
    masterWallet: new PublicKey(data.subarray(8, 40)),
    nav: readU64Le(data, 40),
    totalBrentSupply: readU64Le(data, 48),
    totalPendingClaims: readU64Le(data, 56),
    claimCounter: readU64Le(data, 64),
    withdrawalCounter: readU64Le(data, 72),
  };
}

function readU64LeBigInt(data: Uint8Array, offset: number): bigint {
  let value = BigInt(0);
  for (let i = 0; i < 8; i += 1) {
    value |= BigInt(data[offset + i] ?? 0) << BigInt(8 * i);
  }
  return value;
}

async function fetchReturnedAmountsByWithdrawal(
  connection: ReturnType<typeof useConnection>["connection"],
  programId: PublicKey
): Promise<Map<string, bigint>> {
  const totals = new Map<string, bigint>();
  const signatures = await withRateLimitRetry(() =>
    connection.getSignaturesForAddress(programId, { limit: RETURN_SCAN_SIGNATURE_LIMIT })
  );

  for (const signatureInfo of signatures) {
    const tx = await withRateLimitRetry(() =>
      connection.getTransaction(signatureInfo.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      })
    );

    if (!tx) continue;

    const message = tx.transaction.message;
    const accountKeys = message.staticAccountKeys;

    for (const ix of message.compiledInstructions) {
      const ixProgramId = accountKeys[ix.programIdIndex];
      if (!ixProgramId?.equals(programId)) continue;

      const discKey = Array.from(ix.data.slice(0, 8)).join(",");
      if (discKey !== MASTER_REPAY_DISC && discKey !== MASTER_CANCEL_DISC) continue;
      if (ix.accountKeyIndexes.length < 2 || ix.data.length < 16) continue;

      const withdrawalKey = accountKeys[ix.accountKeyIndexes[1]]?.toBase58();
      if (!withdrawalKey) continue;

      const amount = readU64LeBigInt(ix.data, 8);
      totals.set(withdrawalKey, (totals.get(withdrawalKey) ?? BigInt(0)) + amount);
    }
  }

  return totals;
}

export function useMasterWithdrawals() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const cacheRef = useRef<{
    pool: MasterPoolState | null;
    withdrawals: MasterWithdrawal[];
    timestamp: number;
    endpoint: string;
  } | null>(null);
  const [pool, setPool] = useState<MasterPoolState | null>(null);
  const [withdrawals, setWithdrawals] = useState<MasterWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const program = useMemo(() => {
    if (wallet.publicKey) return getMasterProgram(connection, wallet);
    return getReadonlyMasterProgram(connection);
  }, [connection, wallet]);

  const poolPda = useMemo(() => getMasterPoolPda(), []);
  const rpcEndpoint = connection.rpcEndpoint ?? "";

  const fetchAll = useCallback(
    async (bypassCache = false) => {
      if (!program) return;

      if (
        !bypassCache &&
        cacheRef.current &&
        cacheRef.current.endpoint === rpcEndpoint &&
        Date.now() - cacheRef.current.timestamp < CACHE_TTL
      ) {
        setPool(cacheRef.current.pool);
        setWithdrawals(cacheRef.current.withdrawals);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const accountApi = program.account as {
          withdrawal: { all: () => Promise<RawMasterWithdrawalRecord[]> };
        };

        const poolInfo = await withRateLimitRetry(() =>
          connection.getAccountInfo(poolPda, "confirmed")
        );
        const allWithdrawals = await withRateLimitRetry(() => accountApi.withdrawal.all());
        const returnedAmounts = await fetchReturnedAmountsByWithdrawal(connection, program.programId);

        if (!poolInfo?.data) {
          throw new Error('Pool account not found');
        }

        const normalizedPool = decodePoolAccount(poolInfo.data);

        const normalizedWithdrawals: MasterWithdrawal[] = allWithdrawals
          .map((item) => ({
            pubkey: item.publicKey as PublicKey,
            id: item.account.id.toString(),
            amount: item.account.amount.toString(),
            remaining: item.account.remaining.toString(),
            returned: (returnedAmounts.get(item.publicKey.toBase58()) ?? BigInt(0)).toString(),
            metadataHash: Array.from(item.account.metadataHash as number[]),
            createdAt: item.account.timestamp.toString(),
          }))
          .sort((a, b) => Number(b.id) - Number(a.id));

        cacheRef.current = {
          pool: normalizedPool,
          withdrawals: normalizedWithdrawals,
          timestamp: Date.now(),
          endpoint: rpcEndpoint,
        };

        setPool(normalizedPool);
        setWithdrawals(normalizedWithdrawals);
      } catch (e: unknown) {
        console.error("Error fetching master withdrawals:", e);
        setError(e instanceof Error ? e.message : "Failed to fetch master withdrawal state");
      } finally {
        setLoading(false);
      }
    },
    [connection, program, poolPda, rpcEndpoint]
  );

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    return () => {
      cacheRef.current = null;
    };
  }, []);

  const refresh = useCallback(() => fetchAll(true), [fetchAll]);

  return { pool, withdrawals, loading, error, refresh };
}
