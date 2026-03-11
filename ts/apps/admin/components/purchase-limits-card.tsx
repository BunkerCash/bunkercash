"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AlertCircle, DollarSign, Info, RefreshCw, Settings } from "lucide-react";
import { usePayoutVault } from "@/hooks/usePayoutVault";
import {
  getProgram,
  getReadonlyProgram,
  getPoolPda,
  getBunkercashMintPda,
  PROGRAM_ID,
} from "@/lib/program";

const MAX_PURCHASE_USDC = 1_000_000;
const USDC_DECIMALS = 6;
const CACHE_TTL = 30_000;

interface Stringable {
  toString(): string;
}

interface PoolAccountLike {
  masterWallet: { toBase58(): string };
  nav: Stringable;
}

interface PoolInfo {
  totalSupply: number;
  pricePerToken: number;
  admin: string;
  navUsdc: number;
}

let poolInfoCache: { data: PoolInfo; timestamp: number; endpoint: string } | null = null;

export function PurchaseLimitsCard() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const {
    balance: vaultBalance,
    loading: vaultLoading,
    error: vaultError,
    refresh: refreshVault,
  } = usePayoutVault();

  const rpcEndpoint = connection.rpcEndpoint ?? "";
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(
    poolInfoCache?.endpoint === rpcEndpoint ? poolInfoCache.data : null
  );
  const [poolLoading, setPoolLoading] = useState(
    !(poolInfoCache?.endpoint === rpcEndpoint && poolInfoCache.data)
  );
  const [poolError, setPoolError] = useState<string | null>(null);

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), []);
  const mintPda = useMemo(() => getBunkercashMintPda(PROGRAM_ID), []);

  const program = useMemo(() => {
    if (wallet.publicKey) return getProgram(connection, wallet);
    return getReadonlyProgram(connection);
  }, [connection, wallet]);

  const fetchPoolInfo = useCallback(
    async (bypassCache = false) => {
      if (!program) return;

      if (
        !bypassCache &&
        poolInfoCache &&
        poolInfoCache.endpoint === rpcEndpoint &&
        Date.now() - poolInfoCache.timestamp < CACHE_TTL
      ) {
        setPoolInfo(poolInfoCache.data);
        setPoolLoading(false);
        return;
      }

      setPoolLoading(true);
      setPoolError(null);
      try {
        const accountApi = program.account as {
          pool: { fetch: (pubkey: typeof poolPda) => Promise<PoolAccountLike> };
        };
        const [poolAccount, mintInfo] = await Promise.all([
          accountApi.pool.fetch(poolPda),
          connection.getTokenSupply(mintPda, "confirmed"),
        ]);

        const supplyDecimals = mintInfo.value.decimals;
        const totalSupply = Number(mintInfo.value.amount) / 10 ** supplyDecimals;
        const navUsdc = Number(poolAccount.nav.toString()) / 10 ** USDC_DECIMALS;
        const pricePerToken = totalSupply > 0 ? navUsdc / totalSupply : 1;

        const info: PoolInfo = {
          totalSupply,
          pricePerToken,
          admin: poolAccount.masterWallet.toBase58(),
          navUsdc,
        };

        poolInfoCache = {
          data: info,
          timestamp: Date.now(),
          endpoint: rpcEndpoint,
        };
        setPoolInfo(info);
      } catch (e: unknown) {
        setPoolError(e instanceof Error ? e.message : "Failed to fetch pool info");
      } finally {
        setPoolLoading(false);
      }
    },
    [connection, mintPda, poolPda, program, rpcEndpoint]
  );

  useEffect(() => {
    void fetchPoolInfo();
  }, [fetchPoolInfo]);

  const totalVolume = poolInfo
    ? Math.round(poolInfo.totalSupply * poolInfo.pricePerToken)
    : 0;
  const utilizationPercent = Math.min(
    Math.round((totalVolume / MAX_PURCHASE_USDC) * 100),
    100
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Purchase Limits</h1>
        <button
          onClick={() => {
            void fetchPoolInfo(true);
            void refreshVault();
          }}
          className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800/40 hover:text-white"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
          <div className="mb-5 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              Total Volume Bought
            </span>
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              Live
            </span>
          </div>

          {poolLoading ? (
            <div className="mb-4 h-8 w-32 animate-pulse rounded bg-neutral-800/60" />
          ) : poolError ? (
            <p className="mb-4 text-sm text-red-400">{poolError}</p>
          ) : (
            <>
              <div className="mb-1 font-mono text-3xl font-bold tracking-tight text-white">
                ${totalVolume.toLocaleString("en-US")}
              </div>
              <div className="mb-4 text-xs text-neutral-500">
                {poolInfo?.totalSupply.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}{" "}
                BNKR @ ${poolInfo?.pricePerToken.toFixed(2)} USDC
              </div>
            </>
          )}

          {poolLoading ? (
            <div className="mb-2.5 flex items-center justify-between">
              <div className="h-3 w-16 animate-pulse rounded bg-neutral-800/60" />
              <div className="h-3 w-24 animate-pulse rounded bg-neutral-800/60" />
            </div>
          ) : (
            <div className="mb-2.5 flex items-center justify-between text-xs text-neutral-500">
              <span>{utilizationPercent}% of current cap</span>
              <span>${MAX_PURCHASE_USDC.toLocaleString()} max/tx</span>
            </div>
          )}

          <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-[#00FFB2] transition-all duration-500"
              style={{ width: `${utilizationPercent}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
          <div className="mb-5 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-neutral-500" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              Treasury (Payout Vault)
            </span>
          </div>

          {vaultLoading ? (
            <div className="mb-2 h-8 w-24 animate-pulse rounded bg-neutral-800/60" />
          ) : vaultError ? (
            <p className="text-sm text-red-400">{vaultError}</p>
          ) : (
            <>
              <div className="mb-1 font-mono text-3xl font-bold tracking-tight text-[#00FFB2]">
                ${Number(vaultBalance ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-neutral-500">USDC available for claims</div>
            </>
          )}

          {poolInfo && (
            <div className="mt-4 border-t border-neutral-800/60 pt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500">Current Price</span>
                <span className="font-mono font-medium text-white">
                  ${poolInfo.pricePerToken.toFixed(6)} USDC/BNKR
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-neutral-500">Pool NAV</span>
                <span className="font-mono font-medium text-white">
                  ${poolInfo.navUsdc.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
        <div className="mb-5 flex items-center gap-2">
          <Settings className="h-4 w-4 text-neutral-500" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Limit Reference
          </span>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#00FFB2]" />
            <div className="space-y-2 text-sm text-neutral-300">
              <p>
                This page is read-only. The primary buy flow is currently capped at{" "}
                <span className="font-mono text-white">${MAX_PURCHASE_USDC.toLocaleString()}</span>{" "}
                per transaction.
              </p>
              <p className="text-neutral-500">
                Pool stats are read from the on-chain pool account and current mint supply.
              </p>
            </div>
          </div>
        </div>

        {poolInfo && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
            <div className="text-xs text-neutral-400">
              Current pool admin: <span className="font-mono text-neutral-200">{poolInfo.admin}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
