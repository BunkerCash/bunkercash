"use client"
import { useEffect, useState, useCallback } from 'react'
import type { PoolDataResponse } from '@/lib/solana-server'

export function usePayoutVault() {
  const [balance, setBalance] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBalance = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/pool-data')
      if (!res.ok) throw new Error(`pool-data: ${res.status}`)
      const data: PoolDataResponse = await res.json()
      const raw = data.treasuryUsdcRaw ?? 0
      setBalance(raw.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
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

  return { balance, loading, error, refresh: fetchBalance }
}
