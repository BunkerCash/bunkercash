"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  getMasterPoolPda,
  getReadonlyMasterProgram,
  getMasterProgram,
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
  createdAt: string;
}

interface Stringable {
  toString(): string;
}

interface RawPoolAccount {
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
          pool: { fetch: (pubkey: PublicKey) => Promise<RawPoolAccount> };
          withdrawal: { all: () => Promise<RawMasterWithdrawalRecord[]> };
        };

        const [poolAccount, allWithdrawals] = await Promise.all([
          accountApi.pool.fetch(poolPda),
          accountApi.withdrawal.all(),
        ]);

        const normalizedPool: MasterPoolState = {
          masterWallet: poolAccount.masterWallet as PublicKey,
          nav: poolAccount.nav.toString(),
          totalBrentSupply: poolAccount.totalBrentSupply.toString(),
          totalPendingClaims: poolAccount.totalPendingClaims.toString(),
          claimCounter: poolAccount.claimCounter.toString(),
          withdrawalCounter: poolAccount.withdrawalCounter.toString(),
        };

        const normalizedWithdrawals: MasterWithdrawal[] = allWithdrawals
          .map((item) => ({
            pubkey: item.publicKey as PublicKey,
            id: item.account.id.toString(),
            amount: item.account.amount.toString(),
            remaining: item.account.remaining.toString(),
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
    [program, poolPda, rpcEndpoint]
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
