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
const LOCAL_RETURNED_STORAGE_KEY = "bunkercash.masterReturnedOverrides.v2";
const MASTER_REPAY_DISC = "196,123,175,178,81,52,168,164";
const MASTER_CANCEL_DISC = "254,236,97,119,73,158,24,170";
const RETURN_SCAN_SIGNATURE_LIMIT = 500;
const TRANSACTION_BATCH_SIZE = 20;
const localReturnedOverrides = new Map<string, bigint>();
let localOverridesLoaded = false;

function ensureLocalReturnedOverridesLoaded() {
  if (localOverridesLoaded || typeof window === "undefined") return;
  localOverridesLoaded = true;

  try {
    const raw = window.localStorage.getItem(LOCAL_RETURNED_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [key, value] of Object.entries(parsed)) {
      localReturnedOverrides.set(key, BigInt(value));
    }
  } catch {
    localReturnedOverrides.clear();
  }
}

function persistLocalReturnedOverrides() {
  if (typeof window === "undefined") return;

  const serialized = Object.fromEntries(
    Array.from(localReturnedOverrides.entries()).map(([key, value]) => [
      key,
      value.toString(),
    ]),
  );
  window.localStorage.setItem(
    LOCAL_RETURNED_STORAGE_KEY,
    JSON.stringify(serialized),
  );
}

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

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchReturnedAmountsByWithdrawal(
  connection: ReturnType<typeof useConnection>["connection"],
  programId: PublicKey,
  withdrawals: RawMasterWithdrawalRecord[],
): Promise<Map<string, bigint>> {
  const withdrawalKeys = new Set(
    withdrawals.map((withdrawal) => withdrawal.publicKey.toBase58()),
  );
  const signatures = await withRateLimitRetry(() =>
    connection.getSignaturesForAddress(programId, {
      limit: RETURN_SCAN_SIGNATURE_LIMIT,
    }),
  );
  const uniqueSignatures = signatures.map((signature) => signature.signature);
  const totals = new Map<string, bigint>();

  for (const signatureBatch of chunkArray(
    uniqueSignatures,
    TRANSACTION_BATCH_SIZE,
  )) {
    const txs = await withRateLimitRetry(() =>
      connection.getTransactions(signatureBatch, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      }),
    );

    for (const tx of txs) {
      if (!tx) continue;

      const accountKeys =
        tx.transaction.message.version === 0
          ? tx.transaction.message.getAccountKeys({
              accountKeysFromLookups: tx.meta?.loadedAddresses,
            })
          : tx.transaction.message.getAccountKeys();

      const compiledIxs = tx.transaction.message.compiledInstructions;
      if (!compiledIxs) continue;

      for (const ix of compiledIxs) {
        const ixProgramId = accountKeys.get(ix.programIdIndex);
        if (!ixProgramId?.equals(programId)) continue;
        if (ix.data.length < 16) continue;
        const discKey = Array.from(ix.data.slice(0, 8)).join(",");
        if (discKey !== MASTER_REPAY_DISC && discKey !== MASTER_CANCEL_DISC) {
          continue;
        }

        const amount = readU64LeBigInt(ix.data, 8);
        for (const accountIndex of ix.accountKeyIndexes) {
          const withdrawalKey = accountKeys.get(accountIndex)?.toBase58();
          if (!withdrawalKey || !withdrawalKeys.has(withdrawalKey)) continue;

          totals.set(
            withdrawalKey,
            (totals.get(withdrawalKey) ?? BigInt(0)) + amount,
          );
          break;
        }
      }
    }
  }

  return totals;
}

export function recordLocalReturnedAmount(
  withdrawalPubkey: PublicKey,
  amount: bigint,
) {
  ensureLocalReturnedOverridesLoaded();
  const key = withdrawalPubkey.toBase58();
  localReturnedOverrides.set(
    key,
    (localReturnedOverrides.get(key) ?? BigInt(0)) + amount,
  );
  persistLocalReturnedOverrides();
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
  const fetchSequenceRef = useRef(0);
  const [pool, setPool] = useState<MasterPoolState | null>(null);
  const [withdrawals, setWithdrawals] = useState<MasterWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const program = useMemo(() => {
    if (wallet.publicKey) {
      return getMasterProgram(connection, wallet) ?? getReadonlyMasterProgram(connection);
    }
    return getReadonlyMasterProgram(connection);
  }, [connection, wallet]);

  const poolPda = useMemo(() => getMasterPoolPda(), []);
  const rpcEndpoint = connection.rpcEndpoint ?? "";

  const fetchAll = useCallback(
    async (bypassCache = false) => {
      if (!program) {
        setLoading(false);
        return;
      }
      const fetchSequence = ++fetchSequenceRef.current;

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
        ensureLocalReturnedOverridesLoaded();

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

        let returnedAmounts = new Map<string, bigint>();
        try {
          returnedAmounts = await fetchReturnedAmountsByWithdrawal(
            connection,
            program.programId,
            allWithdrawals,
          );
        } catch (historyError) {
          console.warn(
            "Unable to enrich returned amounts from transaction history:",
            historyError,
          );
        }

        if (fetchSequence !== fetchSequenceRef.current) return;

        const normalizedWithdrawals: MasterWithdrawal[] = allWithdrawals
          .map((item) => {
            const key = item.publicKey.toBase58();
            const amount = BigInt(item.account.amount.toString());
            const remaining = BigInt(item.account.remaining.toString());
            const accountReturned =
              amount > remaining ? amount - remaining : BigInt(0);
            const localReturned =
              localReturnedOverrides.get(key) ?? BigInt(0);
            const historyReturned =
              returnedAmounts.get(key) ?? BigInt(0);
            const returned = [
              accountReturned,
              localReturned,
              historyReturned,
            ].reduce((max, value) => (value > max ? value : max), BigInt(0));

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
        setError(null);
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
