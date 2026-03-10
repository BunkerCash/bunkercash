"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import type { Idl, Program } from "@coral-xyz/anchor"
import { PublicKey } from "@solana/web3.js"
import { getProgram, getReadonlyProgram } from "@/lib/program"

interface Stringable {
  toString(): string
}

interface RawClaimRecord {
  publicKey: PublicKey
  account: {
    user: PublicKey
    usdcAmount: Stringable
    timestamp: Stringable
    processed: boolean
    paidAmount: Stringable
  }
}

export interface OpenClaim {
  pubkey: PublicKey
  id: string
  user: PublicKey
  requestedUsdc: string
  paidUsdc: string
  processed: boolean
  createdAt: string
}

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
  const wallet = useWallet()
  const cacheRef = useRef<ClaimsCache | null>(null)
  const [claims, setClaims] = useState<OpenClaim[]>([])
  const [closedClaims, setClosedClaims] = useState<OpenClaim[]>([])
  const [totalRequested, setTotalRequested] = useState<bigint>(BigInt(0))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const program = useMemo(() => {
    if (wallet.publicKey) {
      return getProgram(connection, wallet)
    }
    return getReadonlyProgram(connection)
  }, [connection, wallet])

  const rpcEndpoint = connection.rpcEndpoint ?? ""

  const fetchClaims = useCallback(async (bypassCache = false) => {
    if (!program) return

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
      const accountApi = (program as Program<Idl>).account as {
        claim: { all: () => Promise<RawClaimRecord[]> }
      }
      const all = await accountApi.claim.all()

      const normalize = (item: RawClaimRecord): OpenClaim => ({
        pubkey: item.publicKey,
        id: item.publicKey.toBase58().slice(0, 8),
        user: item.account.user,
        requestedUsdc: item.account.usdcAmount.toString(),
        paidUsdc: item.account.paidAmount.toString(),
        processed: Boolean(item.account.processed),
        createdAt: item.account.timestamp.toString(),
      })

      const open = all.filter((item) => !item.account.processed)
      const closed = all.filter((item) => item.account.processed)

      let requested = BigInt(0)
      const normalizedOpen = open
        .map((item) => {
          requested += BigInt(item.account.usdcAmount.toString())
          return normalize(item)
        })
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))

      const normalizedClosed = closed
        .map(normalize)
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
  }, [program, rpcEndpoint])

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
