"use client"
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { getPoolPda, getPoolSignerPda, PROGRAM_ID } from '@/lib/program'
import { getClusterFromEndpoint, getUsdcMintForCluster } from "@/lib/constants"
import type { PoolDataResponse } from "@/lib/solana-server"

export function usePayoutVault() {
  const { connection } = useConnection()
  const [balance, setBalance] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), [])
  const poolSignerPda = useMemo(() => getPoolSignerPda(poolPda, PROGRAM_ID), [poolPda])

  const usdcMint = useMemo(() => {
    if (!connection) return null
    const endpoint = connection.rpcEndpoint ?? ""
    const cluster = getClusterFromEndpoint(endpoint)
    return getUsdcMintForCluster(cluster)
  }, [connection])

  const payoutUsdcVault = useMemo(() => {
    if (!usdcMint) return null
    return getAssociatedTokenAddressSync(
      usdcMint,
      poolSignerPda,
      true,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  }, [usdcMint, poolSignerPda])

  const fetchBalance = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/pool-data")
      if (!res.ok) throw new Error(`pool-data: ${res.status}`)
      const data: PoolDataResponse = await res.json()
      setBalance(data.treasuryUsdcRaw?.toString() ?? '0')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch balance')
      setBalance(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBalance()
  }, [fetchBalance])

  // Keep real-time subscription for live updates after settlements.
  // Bypass the KV-cached /api/pool-data route so on-chain changes are
  // reflected immediately in the UI.
  useEffect(() => {
    if (!connection || !payoutUsdcVault) return

    const subscriptionId = connection.onAccountChange(
      payoutUsdcVault,
      async () => {
        try {
          const bal = await connection.getTokenAccountBalance(payoutUsdcVault, "confirmed")
          setBalance(bal.value.uiAmountString ?? '0')
        } catch {
          // Fall back to cached route on error
          void fetchBalance()
        }
      },
      "confirmed"
    )

    return () => {
      connection.removeAccountChangeListener(subscriptionId).catch(() => {})
    }
  }, [connection, payoutUsdcVault, fetchBalance])

  return { balance, loading, error, refresh: fetchBalance }
}
