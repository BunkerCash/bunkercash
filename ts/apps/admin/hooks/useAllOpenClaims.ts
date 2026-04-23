"use client"

import { useCallback, useEffect, useState } from "react"
import type { ClaimsResponse, SerializedClaim } from "@/lib/solana-server"

export type OpenClaim = SerializedClaim

function normalizeClaims(data: ClaimsResponse) {
  const reopenedClosed = data.open.filter(
    (claim) => claim.processed || claim.cancelled || BigInt(claim.remainingUsdc) === BigInt(0)
  )
  const open = data.open.filter(
    (claim) => !claim.processed && !claim.cancelled && BigInt(claim.remainingUsdc) > BigInt(0)
  )
  const closed = [...data.closed, ...reopenedClosed]
  const totalRequested = open.reduce(
    (sum, claim) => sum + BigInt(claim.remainingUsdc),
    BigInt(0)
  )

  return { open, closed, totalRequested }
}

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
      const normalized = normalizeClaims(data)

      setClaims(normalized.open)
      setClosedClaims(normalized.closed)
      setTotalRequested(normalized.totalRequested)
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
