"use client"
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { getPoolPda, getPoolSignerPda, PROGRAM_ID } from '@/lib/program'
import { getClusterFromEndpoint, getUsdcMintForCluster } from "@/lib/constants";

const USDC_DECIMALS = 6;

const CACHE_TTL = 30_000 // 30 seconds
let vaultCache: { data: string; timestamp: number; endpoint: string } | null = null

export function usePayoutVault() {
  const { connection } = useConnection()
  const [balance, setBalance] = useState<string | null>(vaultCache?.data ?? null)
  const [loading, setLoading] = useState(!vaultCache)
  const [error, setError] = useState<string | null>(null)

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), [])
  const poolSignerPda = useMemo(() => getPoolSignerPda(poolPda, PROGRAM_ID), [poolPda])

  const usdcMint = useMemo(() => {
    if (!connection) return null;
    const endpoint = (connection as any).rpcEndpoint ?? "";
    const cluster = getClusterFromEndpoint(endpoint);
    return getUsdcMintForCluster(cluster);
  }, [connection]);

  const rpcEndpoint = (connection as any).rpcEndpoint ?? ""

  const fetchBalance = useCallback(async (bypassCache = false) => {
    if (!connection || !usdcMint) return

    if (!bypassCache && vaultCache && vaultCache.endpoint === rpcEndpoint && Date.now() - vaultCache.timestamp < CACHE_TTL) {
      setBalance(vaultCache.data)
      setLoading(false)
      return
    }

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
      const value = bal.value.uiAmountString ?? '0'
      vaultCache = { data: value, timestamp: Date.now(), endpoint: rpcEndpoint }
      setBalance(value)
    } catch (e: any) {
      if (e.message?.includes('could not find account')) {
        vaultCache = { data: '0', timestamp: Date.now(), endpoint: rpcEndpoint }
        setBalance('0')
      } else {
        console.error('Error fetching payout vault balance:', e)
        setError(e.message || 'Failed to fetch balance')
        setBalance(null)
      }
    } finally {
      setLoading(false)
    }
  }, [connection, usdcMint, poolSignerPda, rpcEndpoint])

  useEffect(() => {
    fetchBalance()
  }, [fetchBalance])

  const refresh = useCallback(() => fetchBalance(true), [fetchBalance])

  return { balance, loading, error, refresh }
}
