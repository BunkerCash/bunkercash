"use client"
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { getPoolPda, getPoolSignerPda, PROGRAM_ID } from '@/lib/program'
import { getClusterFromEndpoint, getUsdcMintForCluster } from "@/lib/constants";

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
    const endpoint = connection.rpcEndpoint ?? "";
    const cluster = getClusterFromEndpoint(endpoint);
    return getUsdcMintForCluster(cluster);
  }, [connection]);

  const rpcEndpoint = connection.rpcEndpoint ?? ""
  const payoutUsdcVault = useMemo(() => {
    if (!usdcMint) return null
    return getAssociatedTokenAddressSync(
      usdcMint,
      poolSignerPda,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  }, [usdcMint, poolSignerPda])

  const fetchBalance = useCallback(async (bypassCache = false) => {
    if (!connection || !payoutUsdcVault) return

    if (!bypassCache && vaultCache && vaultCache.endpoint === rpcEndpoint && Date.now() - vaultCache.timestamp < CACHE_TTL) {
      setBalance(vaultCache.data)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const bal = await connection.getTokenAccountBalance(payoutUsdcVault)
      const value = bal.value.uiAmountString ?? '0'
      vaultCache = { data: value, timestamp: Date.now(), endpoint: rpcEndpoint }
      setBalance(value)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to fetch balance'
      if (message.includes('could not find account')) {
        vaultCache = { data: '0', timestamp: Date.now(), endpoint: rpcEndpoint }
        setBalance('0')
      } else {
        console.error('Error fetching payout vault balance:', e)
        setError(message)
        setBalance(null)
      }
    } finally {
      setLoading(false)
    }
  }, [connection, payoutUsdcVault, rpcEndpoint])

  useEffect(() => {
    fetchBalance()
  }, [fetchBalance])

  useEffect(() => {
    if (!connection || !payoutUsdcVault) return

    const subscriptionId = connection.onAccountChange(
      payoutUsdcVault,
      () => {
        vaultCache = null
        void fetchBalance(true)
      },
      "confirmed"
    )

    const handleFocus = () => {
      vaultCache = null
      void fetchBalance(true)
    }

    window.addEventListener("focus", handleFocus)
    document.addEventListener("visibilitychange", handleFocus)

    return () => {
      connection.removeAccountChangeListener(subscriptionId).catch(() => {})
      window.removeEventListener("focus", handleFocus)
      document.removeEventListener("visibilitychange", handleFocus)
    }
  }, [connection, payoutUsdcVault, fetchBalance])

  const refresh = useCallback(() => fetchBalance(true), [fetchBalance])

  return { balance, loading, error, refresh }
}
