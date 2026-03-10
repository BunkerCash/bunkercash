"use client"

import { useEffect, useState, useMemo } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { getProgram, getReadonlyProgram } from '@/lib/program'

export function useOpenClaimsCount() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const program = useMemo(() => {
    if (wallet.publicKey) {
      return getProgram(connection, wallet)
    }
    return getReadonlyProgram(connection)
  }, [connection, wallet])

  useEffect(() => {
    const fetchOpenClaims = async () => {
      if (!program) return

      setLoading(true)
      setError(null)
      try {
        const accountApi = program.account as {
          claim: { all: () => Promise<Array<{ account: { processed: boolean } }>> }
        }
        const allClaims = await accountApi.claim.all()
        const openClaims = allClaims.filter((c) => !c.account.processed)
        setCount(openClaims.length)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to fetch open claims')
        setCount(null)
      } finally {
        setLoading(false)
      }
    }

    void fetchOpenClaims()
  }, [program])

  return { count, loading, error }
}
