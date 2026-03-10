"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  getProgram,
  getReadonlyProgram,
  getPoolPda,
  getBunkercashMintPda,
  PROGRAM_ID,
} from "@/lib/program";
import { usePayoutVault } from "@/hooks/usePayoutVault";

const BUNKERCASH_DECIMALS = 6;
const USDC_DECIMALS = 6;

interface Stringable {
  toString(): string;
}

interface PoolAccountLike {
  nav: Stringable;
  totalBrentSupply: Stringable;
  totalPendingClaims: Stringable;
}

export interface PoolStats {
  totalSupply: string | null;
  circulatingSupply: string | null;
  pendingClaimsUsdc: string | null;
  treasuryUsdc: string | null;
  navUsdc: string | null;
  pricePerToken: number | null;
  lastRefreshed: Date | null;
  totalSupplyRaw: number | null;
  circulatingSupplyRaw: number | null;
  pendingClaimsUsdcRaw: number | null;
  treasuryUsdcRaw: number | null;
  navUsdcRaw: number | null;
}

export function usePoolStats() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [stats, setStats] = useState<PoolStats>({
    totalSupply: null,
    circulatingSupply: null,
    pendingClaimsUsdc: null,
    treasuryUsdc: null,
    navUsdc: null,
    pricePerToken: null,
    lastRefreshed: null,
    totalSupplyRaw: null,
    circulatingSupplyRaw: null,
    pendingClaimsUsdcRaw: null,
    treasuryUsdcRaw: null,
    navUsdcRaw: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const program = useMemo(() => {
    if (wallet.publicKey) return getProgram(connection, wallet);
    return getReadonlyProgram(connection);
  }, [connection, wallet]);

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), []);
  const mintPda = useMemo(() => getBunkercashMintPda(PROGRAM_ID), []);

  const {
    balance: vaultBalance,
    loading: vaultLoading,
    error: vaultError,
  } = usePayoutVault();

  const fetchStats = useCallback(async () => {
    if (!program || !connection) return;

    setLoading(true);
    setError(null);
    try {
      const accountApi = program.account as {
        pool: { fetch: (pubkey: typeof poolPda) => Promise<PoolAccountLike> };
      };
      const [mintInfo, poolAccount] = await Promise.all([
        connection.getTokenSupply(mintPda, "confirmed"),
        accountApi.pool.fetch(poolPda),
      ]);

      const totalSupplyRaw = Number(mintInfo.value.amount) / 10 ** BUNKERCASH_DECIMALS;
      const navUsdcRaw = Number(poolAccount.nav.toString()) / 10 ** USDC_DECIMALS;
      const pendingClaimsUsdcRaw =
        Number(poolAccount.totalPendingClaims.toString()) / 10 ** USDC_DECIMALS;
      const treasuryUsdcRaw = vaultBalance ? parseFloat(vaultBalance.replace(/,/g, "")) : null;
      const pricePerToken =
        totalSupplyRaw > 0 ? navUsdcRaw / totalSupplyRaw : 1;

      setStats({
        totalSupply: totalSupplyRaw.toLocaleString(undefined, {
          maximumFractionDigits: 2,
        }),
        circulatingSupply: totalSupplyRaw.toLocaleString(undefined, {
          maximumFractionDigits: 2,
        }),
        pendingClaimsUsdc: pendingClaimsUsdcRaw.toLocaleString(undefined, {
          maximumFractionDigits: 2,
        }),
        treasuryUsdc: vaultBalance,
        navUsdc: navUsdcRaw.toLocaleString(undefined, {
          maximumFractionDigits: 2,
        }),
        pricePerToken,
        lastRefreshed: new Date(),
        totalSupplyRaw,
        circulatingSupplyRaw: totalSupplyRaw,
        pendingClaimsUsdcRaw,
        treasuryUsdcRaw,
        navUsdcRaw,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch pool stats");
    } finally {
      setLoading(false);
    }
  }, [connection, mintPda, poolPda, program, vaultBalance]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading: loading || vaultLoading,
    error: error || vaultError,
    refresh: fetchStats,
  };
}
