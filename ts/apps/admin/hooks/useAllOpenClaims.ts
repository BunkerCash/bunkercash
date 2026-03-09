"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import type { Idl, Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { getProgram, getReadonlyProgram } from '@/lib/program'

export interface OpenClaim {
  pubkey: PublicKey
  id: string
  user: PublicKey
  tokenAmountLocked: string
  priceUsdcPerTokenSnapshot: string | null
  usdcPaid: string
  isClosed: boolean
  createdAt: string
}

interface Stringable {
  toString(): string
}

interface RawClaimRecord {
  publicKey: PublicKey
  account: {
    id: Stringable
    user: PublicKey
    tokenAmountLocked: Stringable
    usdcPaid: Stringable
    isClosed: boolean
    createdAt: Stringable
  }
}

interface RawClaimPriceSnapshotRecord {
  account: {
    claim: PublicKey
    priceUsdcPerToken: Stringable
  }
}

interface ClaimsAccountApi {
  claimState: { all: () => Promise<RawClaimRecord[]> }
  claimPriceSnapshotState?: { all: () => Promise<RawClaimPriceSnapshotRecord[]> }
}

interface ClaimsCache {
  claims: OpenClaim[]
  closedClaims: OpenClaim[]
  totalLocked: bigint
  timestamp: number
  endpoint: string
}

const CACHE_TTL = 30_000 // 30 seconds

export function useAllOpenClaims() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const [claims, setClaims] = useState<OpenClaim[]>([])
  const [closedClaims, setClosedClaims] = useState<OpenClaim[]>([])
  const [totalLocked, setTotalLocked] = useState<bigint>(BigInt(0))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cacheRef = useRef<ClaimsCache | null>(null)

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
      setTotalLocked(cacheRef.current.totalLocked)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const accountApi = (program as Program<Idl>).account as ClaimsAccountApi
      const [all, allSnapshots] = await Promise.all([
        accountApi.claimState.all(),
        accountApi.claimPriceSnapshotState?.all() ?? Promise.resolve([]),
      ])

      const snapshotMap = new Map<string, string>()
      for (const snapshot of allSnapshots) {
        const claim = snapshot.account.claim
        const price = snapshot.account.priceUsdcPerToken?.toString?.() ?? String(snapshot.account.priceUsdcPerToken)
        snapshotMap.set(claim.toBase58(), price)
      }

      const normalize = (x: RawClaimRecord): OpenClaim => {
        const amount = x.account.tokenAmountLocked?.toString?.() ?? String(x.account.tokenAmountLocked)
        const claimPk = x.publicKey.toBase58()
        return {
          pubkey: x.publicKey,
          id: x.account.id?.toString?.() ?? String(x.account.id),
          user: x.account.user,
          tokenAmountLocked: amount,
          priceUsdcPerTokenSnapshot: snapshotMap.get(claimPk) ?? null,
          usdcPaid: x.account.usdcPaid?.toString?.() ?? String(x.account.usdcPaid),
          isClosed: Boolean(x.account.isClosed),
          createdAt: x.account.createdAt?.toString?.() ?? String(x.account.createdAt),
        }
      }

      const open = all.filter((c) => !c.account.isClosed)
      const closed = all.filter((c) => c.account.isClosed)

      let locked = BigInt(0)
      const normalizedOpen = open
        .map((x) => {
          locked += BigInt(x.account.tokenAmountLocked?.toString?.() ?? String(x.account.tokenAmountLocked))
          return normalize(x)
        })
        .sort((a: OpenClaim, b: OpenClaim) => Number(b.id) - Number(a.id))

      const normalizedClosed = closed
        .map(normalize)
        .sort((a: OpenClaim, b: OpenClaim) => Number(b.id) - Number(a.id))

      cacheRef.current = {
        claims: normalizedOpen,
        closedClaims: normalizedClosed,
        totalLocked: locked,
        timestamp: Date.now(),
        endpoint: rpcEndpoint,
      }
      setClaims(normalizedOpen)
      setClosedClaims(normalizedClosed)
      setTotalLocked(locked)
    } catch (e: unknown) {
      console.error('Error fetching all open claims:', e)
      setError(e instanceof Error ? e.message : 'Failed to fetch open claims')
    } finally {
      setLoading(false)
    }
  }, [cacheRef, program, rpcEndpoint])

  useEffect(() => {
    fetchClaims()
  }, [fetchClaims])

  useEffect(() => {
    return () => {
      cacheRef.current = null
    }
  }, [cacheRef])

  const refresh = useCallback(() => fetchClaims(true), [fetchClaims])

  return { claims, closedClaims, totalLocked, loading, error, refresh }
}
