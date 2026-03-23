"use client"
import { useEffect, useState } from 'react'
import type { PoolDataResponse } from '@/lib/solana-server'

export function useTokenPrice() {
  const [price, setPrice] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchPrice() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/pool-data')
        if (!res.ok) throw new Error(`pool-data: ${res.status}`)
        const data: PoolDataResponse = await res.json()
        if (!cancelled) setPrice(data.tokenPrice)
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to fetch token price')
          setPrice(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchPrice()
    return () => { cancelled = true }
  }, [])

  return { price, loading, error }
}
