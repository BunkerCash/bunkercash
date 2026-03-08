"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  getMasterPoolPda,
  getReadonlyMasterProgram,
  getMasterProgram,
  MASTER_PROGRAM_ID,
} from "@/lib/master-program";

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
  metadataHash: number[];
  timestamp: string;
}

interface Stringable {
  toString(): string;
}

interface RawMasterPoolAccount {
  masterWallet: PublicKey;
  nav: Stringable;
  totalBrentSupply: Stringable;
  totalPendingClaims: Stringable;
  claimCounter: Stringable;
  withdrawalCounter: Stringable;
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

let masterCache:
  | {
      pool: MasterPoolState | null;
      withdrawals: MasterWithdrawal[];
      timestamp: number;
      endpoint: string;
    }
  | null = null;

export function useMasterWithdrawals() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [pool, setPool] = useState<MasterPoolState | null>(masterCache?.pool ?? null);
  const [withdrawals, setWithdrawals] = useState<MasterWithdrawal[]>(
    masterCache?.withdrawals ?? []
  );
  const [loading, setLoading] = useState(!masterCache);
  const [error, setError] = useState<string | null>(null);

  const program = useMemo(() => {
    if (wallet.publicKey) return getMasterProgram(connection, wallet);
    return getReadonlyMasterProgram(connection);
  }, [connection, wallet]);

  const poolPda = useMemo(() => getMasterPoolPda(MASTER_PROGRAM_ID), []);
  const rpcEndpoint = connection.rpcEndpoint ?? "";

  const fetchAll = useCallback(
    async (bypassCache = false) => {
      if (!program) return;

      if (
        !bypassCache &&
        masterCache &&
        masterCache.endpoint === rpcEndpoint &&
        Date.now() - masterCache.timestamp < CACHE_TTL
      ) {
        setPool(masterCache.pool);
        setWithdrawals(masterCache.withdrawals);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const masterAccountApi = program.account as {
          pool: { fetchNullable: (pubkey: PublicKey) => Promise<RawMasterPoolAccount | null> };
          withdrawal: { all: () => Promise<RawMasterWithdrawalRecord[]> };
        };

        const [poolAccount, allWithdrawals] = await Promise.all([
          masterAccountApi.pool.fetchNullable(poolPda),
          masterAccountApi.withdrawal.all(),
        ]);

        const normalizedPool: MasterPoolState | null = poolAccount
          ? {
              masterWallet: poolAccount.masterWallet as PublicKey,
              nav: poolAccount.nav.toString(),
              totalBrentSupply: poolAccount.totalBrentSupply.toString(),
              totalPendingClaims: poolAccount.totalPendingClaims.toString(),
              claimCounter: poolAccount.claimCounter.toString(),
              withdrawalCounter: poolAccount.withdrawalCounter.toString(),
            }
          : null;

        const normalizedWithdrawals: MasterWithdrawal[] = allWithdrawals
          .map((item) => ({
            pubkey: item.publicKey as PublicKey,
            id: item.account.id.toString(),
            amount: item.account.amount.toString(),
            remaining: item.account.remaining.toString(),
            metadataHash: Array.from(item.account.metadataHash as number[]),
            timestamp: item.account.timestamp.toString(),
          }))
          .sort((a, b) => Number(b.id) - Number(a.id));

        masterCache = {
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
    [program, poolPda, rpcEndpoint]
  );

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const refresh = useCallback(() => fetchAll(true), [fetchAll]);

  return { pool, withdrawals, loading, error, refresh };
}
