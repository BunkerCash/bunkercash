"use client"
import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { getPoolPda, getPoolSignerPda, PROGRAM_ID } from '@/lib/program'
import { withRateLimitRetry } from "@/lib/rpc-throttle";
import { useSupportedUsdcMint } from "@/hooks/useSupportedUsdcMint";

const CACHE_TTL = 30_000 // 30 seconds

export function usePayoutVault() {
  const { connection } = useConnection()
  const cacheRef = useRef<{ data: string; timestamp: number; endpoint: string } | null>(null)
  const [balance, setBalance] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), [])
  const poolSignerPda = useMemo(() => getPoolSignerPda(poolPda, PROGRAM_ID), [poolPda])

  const { usdcMint } = useSupportedUsdcMint();

  const rpcEndpoint = connection.rpcEndpoint ?? ""
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

  const fetchBalance = useCallback(async (bypassCache = false) => {
    if (!connection || !payoutUsdcVault) return

    if (!bypassCache && cacheRef.current && cacheRef.current.endpoint === rpcEndpoint && Date.now() - cacheRef.current.timestamp < CACHE_TTL) {
      setBalance(cacheRef.current.data)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const bal = await withRateLimitRetry(() =>
        connection.getTokenAccountBalance(payoutUsdcVault)
      )
      const value = bal.value.uiAmountString ?? '0'
      cacheRef.current = { data: value, timestamp: Date.now(), endpoint: rpcEndpoint }
      setBalance(value)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to fetch balance'
      if (message.includes('could not find account')) {
        cacheRef.current = { data: '0', timestamp: Date.now(), endpoint: rpcEndpoint }
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
        cacheRef.current = null
        void fetchBalance(true)
      },
      "confirmed"
    )

    const handleFocus = () => {
      cacheRef.current = null
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

  useEffect(() => {
    return () => {
      cacheRef.current = null
    }
  }, [])

  const refresh = useCallback(() => fetchBalance(true), [fetchBalance])

  return { balance, loading, error, refresh }
}
