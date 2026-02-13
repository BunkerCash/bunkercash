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
  }, [connection, wallet.publicKey])

  useEffect(() => {
    const fetchOpenClaims = async () => {
      if (!program) return
      
      setLoading(true)
      setError(null)
      try {
        // Fetch all ClaimState accounts
        // Note: In a production environment with many claims, we would want 
        // to use `memcmp` filters to only fetch isClosed=false, 
        // or rely on an indexer. `program.account.claimState.all()` fetches everything.
        const allClaims = await (program.account as any).claimState.all()
        
        // Filter for open claims (isClosed === false)
        const openClaims = allClaims.filter((c: any) => !c.account.isClosed)
        
        setCount(openClaims.length)
      } catch (e: any) {
        console.error('Error fetching open claims:', e)
        setError(e.message || 'Failed to fetch open claims')
        setCount(null)
      } finally {
        setLoading(false)
      }
    }

    fetchOpenClaims()
  }, [program])

  return { count, loading, error }
}
