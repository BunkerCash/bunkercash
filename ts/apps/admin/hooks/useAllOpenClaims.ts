"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useConnection } from "@solana/wallet-adapter-react"
import { fetchDecodedClaimAccounts, type DecodedClaimAccount } from "@/lib/claim-accounts"

export interface OpenClaim extends DecodedClaimAccount {}

interface ClaimsCache {
  claims: OpenClaim[]
  closedClaims: OpenClaim[]
  totalRequested: bigint
  timestamp: number
  endpoint: string
}

const CACHE_TTL = 30_000

export function useAllOpenClaims() {
  const { connection } = useConnection()
  const cacheRef = useRef<ClaimsCache | null>(null)
  const [claims, setClaims] = useState<OpenClaim[]>([])
  const [closedClaims, setClosedClaims] = useState<OpenClaim[]>([])
  const [totalRequested, setTotalRequested] = useState<bigint>(BigInt(0))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const rpcEndpoint = connection.rpcEndpoint ?? ""

  const fetchClaims = useCallback(async (bypassCache = false) => {
    if (
      !bypassCache &&
      cacheRef.current &&
      cacheRef.current.endpoint === rpcEndpoint &&
      Date.now() - cacheRef.current.timestamp < CACHE_TTL
    ) {
      setClaims(cacheRef.current.claims)
      setClosedClaims(cacheRef.current.closedClaims)
      setTotalRequested(cacheRef.current.totalRequested)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const normalizedAll = await fetchDecodedClaimAccounts(connection)
      const open = normalizedAll.filter((item) => !item.processed)
      const closed = normalizedAll.filter((item) => item.processed)

      let requested = BigInt(0)
      const normalizedOpen = open
        .map((item) => {
          requested += BigInt(item.remainingUsdc)
          return item
        })
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))

      const normalizedClosed = closed
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))

      cacheRef.current = {
        claims: normalizedOpen,
        closedClaims: normalizedClosed,
        totalRequested: requested,
        timestamp: Date.now(),
        endpoint: rpcEndpoint,
      }

      setClaims(normalizedOpen)
      setClosedClaims(normalizedClosed)
      setTotalRequested(requested)
    } catch (e: unknown) {
      console.error("Error fetching all open claims:", e)
      setError(e instanceof Error ? e.message : "Failed to fetch open claims")
    } finally {
      setLoading(false)
    }
  }, [connection, rpcEndpoint])

  useEffect(() => {
    void fetchClaims()
  }, [fetchClaims])

  useEffect(() => {
    return () => {
      cacheRef.current = null
    }
  }, [])

  const refresh = useCallback(() => fetchClaims(true), [fetchClaims])

  return { claims, closedClaims, totalRequested, loading, error, refresh }
}
