"use client"

import { useCallback, useEffect, useState } from "react"
import type { ClaimsResponse, SerializedClaim } from "@/lib/solana-server"

export type OpenClaim = SerializedClaim

export function useAllOpenClaims() {
  const [claims, setClaims] = useState<OpenClaim[]>([])
  const [closedClaims, setClosedClaims] = useState<OpenClaim[]>([])
  const [totalRequested, setTotalRequested] = useState<bigint>(BigInt(0))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchClaims = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/claims")
      if (!res.ok) throw new Error(`claims: ${res.status}`)
      const data: ClaimsResponse = await res.json()

      setClaims(data.open)
      setClosedClaims(data.closed)
      setTotalRequested(BigInt(data.totalRequestedUsdc))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch open claims")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchClaims()
  }, [fetchClaims])

  return { claims, closedClaims, totalRequested, loading, error, refresh: fetchClaims }
}
