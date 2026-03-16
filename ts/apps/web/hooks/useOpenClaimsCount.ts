"use client"

import { useEffect, useState } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { fetchDecodedClaimAccounts } from '@/lib/claim-accounts'

export function useOpenClaimsCount() {
  const { connection } = useConnection()
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchOpenClaims = async () => {
      setLoading(true)
      setError(null)
      try {
        const allClaims = await fetchDecodedClaimAccounts(connection)
        const openClaims = allClaims.filter((claim) => BigInt(claim.remainingUsdc) > BigInt(0))
        setCount(openClaims.length)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to fetch open claims')
        setCount(null)
      } finally {
        setLoading(false)
      }
    }

    void fetchOpenClaims()
  }, [connection])

  return { count, loading, error }
}
