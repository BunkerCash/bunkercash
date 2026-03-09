"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  getMasterOpsPda,
  getMasterPoolPda,
  getReadonlyMasterProgram,
  getMasterProgram,
} from "@/lib/master-program";

export interface MasterPoolState {
  admin: PublicKey;
  priceUsdcPerToken: string;
  claimCounter: string;
  withdrawalCounter: string;
}

export interface MasterWithdrawal {
  pubkey: PublicKey;
  id: string;
  amount: string;
  remaining: string;
  repaidAmount: string;
  cancelledAmount: string;
  metadataHash: number[];
  createdAt: string;
}

interface Stringable {
  toString(): string;
}

interface RawPoolAccount {
  admin: PublicKey;
  priceUsdcPerToken: Stringable;
  claimCounter: Stringable;
}

interface RawMasterOpsAccount {
  withdrawalCounter: Stringable;
}

interface RawMasterWithdrawalRecord {
  publicKey: PublicKey;
  account: {
    id: Stringable;
    amount: Stringable;
    remaining: Stringable;
    repaidAmount: Stringable;
    cancelledAmount: Stringable;
    metadataHash: Iterable<number>;
    createdAt: Stringable;
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

  const poolPda = useMemo(() => getMasterPoolPda(), []);
  const masterOpsPda = useMemo(() => getMasterOpsPda(), []);
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
        const accountApi = program.account as {
          poolState: { fetchNullable: (pubkey: PublicKey) => Promise<RawPoolAccount | null> };
          masterOpsState: {
            fetchNullable: (pubkey: PublicKey) => Promise<RawMasterOpsAccount | null>;
          };
          masterWithdrawalState: { all: () => Promise<RawMasterWithdrawalRecord[]> };
        };

        const [poolAccount, masterOpsAccount, allWithdrawals] = await Promise.all([
          accountApi.poolState.fetchNullable(poolPda),
          accountApi.masterOpsState.fetchNullable(masterOpsPda),
          accountApi.masterWithdrawalState.all(),
        ]);

        const normalizedPool: MasterPoolState | null = poolAccount
          ? {
              admin: poolAccount.admin as PublicKey,
              priceUsdcPerToken: poolAccount.priceUsdcPerToken.toString(),
              claimCounter: poolAccount.claimCounter.toString(),
              withdrawalCounter: masterOpsAccount?.withdrawalCounter.toString() ?? "0",
            }
          : null;

        const normalizedWithdrawals: MasterWithdrawal[] = allWithdrawals
          .map((item) => ({
            pubkey: item.publicKey as PublicKey,
            id: item.account.id.toString(),
            amount: item.account.amount.toString(),
            remaining: item.account.remaining.toString(),
            repaidAmount: item.account.repaidAmount.toString(),
            cancelledAmount: item.account.cancelledAmount.toString(),
            metadataHash: Array.from(item.account.metadataHash as number[]),
            createdAt: item.account.createdAt.toString(),
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
    [program, poolPda, masterOpsPda, rpcEndpoint]
  );

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const refresh = useCallback(() => fetchAll(true), [fetchAll]);

  return { pool, withdrawals, loading, error, refresh };
}
