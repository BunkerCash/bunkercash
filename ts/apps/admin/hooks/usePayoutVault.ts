"use client"
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { getPoolPda, getPoolSignerPda, PROGRAM_ID } from '@/lib/program'
import { getClusterFromEndpoint, getUsdcMintForCluster } from "@/lib/constants";

const USDC_DECIMALS = 6;

export function usePayoutVault() {
  const { connection } = useConnection()
  const [balance, setBalance] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), [])
  const poolSignerPda = useMemo(() => getPoolSignerPda(poolPda, PROGRAM_ID), [poolPda])

  const usdcMint = useMemo(() => {
    if (!connection) return null;
    const endpoint = (connection as any).rpcEndpoint ?? "";
    const cluster = getClusterFromEndpoint(endpoint);
    return getUsdcMintForCluster(cluster);
  }, [connection]);

  const fetchBalance = useCallback(async () => {
    if (!connection || !usdcMint) return

    setLoading(true)
    setError(null)
    try {
      const payoutUsdcVault = getAssociatedTokenAddressSync(
        usdcMint,
        poolSignerPda,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )

      const bal = await connection.getTokenAccountBalance(payoutUsdcVault)
      setBalance(bal.value.uiAmountString ?? '0')
    } catch (e: any) {
      if (e.message?.includes('could not find account')) {
        setBalance('0')
      } else {
        console.error('Error fetching payout vault balance:', e)
        setError(e.message || 'Failed to fetch balance')
        setBalance(null)
      }
    } finally {
      setLoading(false)
    }
  }, [connection, usdcMint, poolSignerPda])

  useEffect(() => {
    fetchBalance()
  }, [fetchBalance])

  return { balance, loading, error, refresh: fetchBalance }
}
