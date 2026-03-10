"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { getProgram, getReadonlyProgram } from '@/lib/program'

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

export function useAllOpenClaims() {
  const { connection } = useConnection()
  const wallet = useWallet()
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

  const fetchClaims = useCallback(async () => {
    if (!program) return

    setLoading(true)
    setError(null)
    try {
      const accountApi = program.account as {
        claim: { all: () => Promise<RawClaimRecord[]> }
      }
      const all = await accountApi.claim.all()

      const normalize = (x: RawClaimRecord): OpenClaim => ({
        pubkey: x.publicKey,
        id: x.publicKey.toBase58().slice(0, 8),
        user: x.account.user,
        requestedUsdc: x.account.usdcAmount.toString(),
        paidUsdc: x.account.paidAmount.toString(),
        processed: Boolean(x.account.processed),
        createdAt: x.account.timestamp.toString(),
      })

      const open = all.filter((c) => !c.account.processed)
      const closed = all.filter((c) => c.account.processed)

      let requested = BigInt(0)
      const normalizedOpen = open
        .map((x) => {
          requested += BigInt(x.account.usdcAmount.toString())
          return normalize(x)
        })
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))

      const normalizedClosed = closed
        .map(normalize)
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))

      setClaims(normalizedOpen)
      setClosedClaims(normalizedClosed)
      setTotalRequested(requested)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to fetch open claims'
      console.error('Error fetching all open claims:', e)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [program])

  useEffect(() => {
    void fetchClaims()
  }, [fetchClaims])

  return { claims, closedClaims, totalRequested, loading, error, refresh: fetchClaims }
}
