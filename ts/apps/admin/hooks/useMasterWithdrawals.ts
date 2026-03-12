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
          connection.getAccountInfo(poolPda, "confirmed"),
        );
        const allWithdrawals = await withRateLimitRetry(() =>
          accountApi.withdrawal.all(),
        );
        if (!poolInfo?.data) {
          throw new Error("Pool account not found");
        }

        const normalizedPool = decodePoolAccount(poolInfo.data);

        const normalizedWithdrawals: MasterWithdrawal[] = allWithdrawals
          .map((item) => {
            const amount = BigInt(item.account.amount.toString());
            const remaining = BigInt(item.account.remaining.toString());
            const returned =
              amount > remaining ? amount - remaining : BigInt(0);

            return {
              pubkey: item.publicKey as PublicKey,
              id: item.account.id.toString(),
              amount: amount.toString(),
              remaining: remaining.toString(),
              returned: returned.toString(),
              metadataHash: Array.from(item.account.metadataHash as number[]),
              createdAt: item.account.timestamp.toString(),
            };
          })
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
        setError(
          e instanceof Error
            ? e.message
            : "Failed to fetch master withdrawal state",
        );
      } finally {
        setLoading(false);
      }
    },
    [connection, program, poolPda, rpcEndpoint],
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
