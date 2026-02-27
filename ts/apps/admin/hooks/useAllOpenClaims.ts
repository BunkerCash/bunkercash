"use client"
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { getProgram, getReadonlyProgram } from '@/lib/program'

export interface OpenClaim {
  pubkey: PublicKey
  id: string
  user: PublicKey
  tokenAmountLocked: string
  usdcPaid: string
  isClosed: boolean
  createdAt: string
}

const CACHE_TTL = 30_000 // 30 seconds
let claimsCache: {
  claims: OpenClaim[]
  closedClaims: OpenClaim[]
  totalLocked: bigint
  timestamp: number
} | null = null

export function useAllOpenClaims() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const [claims, setClaims] = useState<OpenClaim[]>(claimsCache?.claims ?? [])
  const [closedClaims, setClosedClaims] = useState<OpenClaim[]>(claimsCache?.closedClaims ?? [])
  const [totalLocked, setTotalLocked] = useState<bigint>(claimsCache?.totalLocked ?? BigInt(0))
  const [loading, setLoading] = useState(!claimsCache)
  const [error, setError] = useState<string | null>(null)

  const program = useMemo(() => {
    if (wallet.publicKey) {
      return getProgram(connection, wallet)
    }
    return getReadonlyProgram(connection)
  }, [connection, wallet.publicKey])

  const fetchClaims = useCallback(async (bypassCache = false) => {
    if (!program) return

    if (!bypassCache && claimsCache && Date.now() - claimsCache.timestamp < CACHE_TTL) {
      setClaims(claimsCache.claims)
      setClosedClaims(claimsCache.closedClaims)
      setTotalLocked(claimsCache.totalLocked)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const all = await (program.account as any).claimState.all()

      const normalize = (x: any): OpenClaim => {
        const amount = x.account.tokenAmountLocked?.toString?.() ?? String(x.account.tokenAmountLocked)
        return {
          pubkey: x.publicKey as PublicKey,
          id: x.account.id?.toString?.() ?? String(x.account.id),
          user: x.account.user as PublicKey,
          tokenAmountLocked: amount,
          usdcPaid: x.account.usdcPaid?.toString?.() ?? String(x.account.usdcPaid),
          isClosed: Boolean(x.account.isClosed),
          createdAt: x.account.createdAt?.toString?.() ?? String(x.account.createdAt),
        }
      }

      const open = all.filter((c: any) => !c.account.isClosed)
      const closed = all.filter((c: any) => c.account.isClosed)

      let locked = BigInt(0)
      const normalizedOpen = open
        .map((x: any) => {
          locked += BigInt(x.account.tokenAmountLocked?.toString?.() ?? String(x.account.tokenAmountLocked))
          return normalize(x)
        })
        .sort((a: OpenClaim, b: OpenClaim) => Number(b.id) - Number(a.id))

      const normalizedClosed = closed
        .map(normalize)
        .sort((a: OpenClaim, b: OpenClaim) => Number(b.id) - Number(a.id))

      claimsCache = { claims: normalizedOpen, closedClaims: normalizedClosed, totalLocked: locked, timestamp: Date.now() }
      setClaims(normalizedOpen)
      setClosedClaims(normalizedClosed)
      setTotalLocked(locked)
    } catch (e: any) {
      console.error('Error fetching all open claims:', e)
      setError(e.message || 'Failed to fetch open claims')
    } finally {
      setLoading(false)
    }
  }, [program])

  useEffect(() => {
    fetchClaims()
  }, [fetchClaims])

  const refresh = useCallback(() => fetchClaims(true), [fetchClaims])

  return { claims, closedClaims, totalLocked, loading, error, refresh }
}
