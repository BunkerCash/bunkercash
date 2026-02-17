"use client";
import { useEffect, useState, useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  getProgram,
  getReadonlyProgram,
  getPoolPda,
  getBunkercashMintPda,
  PROGRAM_ID,
} from "@/lib/program";
import { usePayoutVault } from "@/hooks/usePayoutVault";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";

const BUNKERCASH_DECIMALS = 9;
const USDC_DECIMALS = 6;

export interface PoolStats {
  totalSupply: string | null;
  lockedSupply: string | null;
  circulatingSupply: string | null;
  treasuryUsdc: string | null;
  pricePerToken: number | null;
  lastRefreshed: Date | null;
}

export function usePoolStats() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [stats, setStats] = useState<PoolStats>({
    totalSupply: null,
    lockedSupply: null,
    circulatingSupply: null,
    treasuryUsdc: null,
    pricePerToken: null,
    lastRefreshed: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const program = useMemo(() => {
    if (wallet.publicKey) return getProgram(connection, wallet);
    return getReadonlyProgram(connection);
  }, [connection, wallet.publicKey]);

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), []);
  const mintPda = useMemo(() => getBunkercashMintPda(PROGRAM_ID), []);

  const {
    balance: vaultBalance,
    loading: vaultLoading,
    error: vaultError,
  } = usePayoutVault();

  const fetchStats = async () => {
    if (!program || !connection) return;

    setLoading(true);
    setError(null);
    try {
      // 1. Fetch total supply from the Token-2022 mint
      const mintInfo = await connection.getTokenSupply(mintPda, "confirmed");
      const totalSupplyRaw = BigInt(mintInfo.value.amount);
      const totalSupplyUi =
        Number(totalSupplyRaw) / 10 ** BUNKERCASH_DECIMALS;

      // 2. Fetch all claims to calculate locked supply
      const allClaims = await (program.account as any).claimState.all();
      let lockedRaw = BigInt(0);
      for (const c of allClaims) {
        if (!c.account.isClosed) {
          lockedRaw += BigInt(
            c.account.tokenAmountLocked?.toString?.() ?? "0"
          );
        }
      }
      const lockedSupplyUi = Number(lockedRaw) / 10 ** BUNKERCASH_DECIMALS;

      // 3. Circulating = total - locked
      const circulatingUi = totalSupplyUi - lockedSupplyUi;

      // 4. Fetch price from PoolState
      const poolAccount = await (program.account as any).poolState.fetch(
        poolPda
      );
      const priceRaw = poolAccount.priceUsdcPerToken as BN;
      const priceFloat = Number(priceRaw.toString()) / 10 ** USDC_DECIMALS;

      setStats({
        totalSupply: totalSupplyUi.toLocaleString(undefined, {
          maximumFractionDigits: 2,
        }),
        lockedSupply: lockedSupplyUi.toLocaleString(undefined, {
          maximumFractionDigits: 2,
        }),
        circulatingSupply: circulatingUi.toLocaleString(undefined, {
          maximumFractionDigits: 2,
        }),
        treasuryUsdc: vaultBalance,
        pricePerToken: priceFloat,
        lastRefreshed: new Date(),
      });
    } catch (e: any) {
      setError(e.message || "Failed to fetch pool stats");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [program, connection, mintPda, poolPda, vaultBalance]);

  return {
    stats,
    loading: loading || vaultLoading,
    error: error || vaultError,
    refresh: fetchStats,
  };
}
