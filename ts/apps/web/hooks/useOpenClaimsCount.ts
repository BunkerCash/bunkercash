"use client"

import { useEffect, useState } from 'react'
import type { ClaimsResponse } from '@/lib/solana-server'

export function useOpenClaimsCount() {
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchCount() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/claims')
        if (!res.ok) throw new Error(`claims: ${res.status}`)
        const data: ClaimsResponse = await res.json()
        if (!cancelled) setCount(data.openCount)
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to fetch open claims')
          setCount(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchCount()
    return () => { cancelled = true }
  }, [])

  return { count, loading, error }
}
