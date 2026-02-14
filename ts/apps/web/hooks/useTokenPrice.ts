"use client"
import { useEffect, useState, useMemo } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { getProgram, getReadonlyProgram, getPoolPda, PROGRAM_ID } from '@/lib/program'
import { BN } from '@coral-xyz/anchor'

export function useTokenPrice() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const [price, setPrice] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const program = useMemo(() => {
    if (wallet.publicKey) {
      return getProgram(connection, wallet)
    }
    return getReadonlyProgram(connection)
  }, [connection, wallet.publicKey])

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), [])

  useEffect(() => {
    const fetchPrice = async () => {
      if (!program) return
      
      setLoading(true)
      setError(null)
      try {
        // Fetch PoolState account
        // casting to any because generated types might be slightly off or tricky to get perfect here
        // verify account name in IDL is 'poolState' (camelCase of 'PoolState')
        // IDL has "accounts": [{"name": "PoolState", ...}] -> anchor converts to poolState
        const poolAccount = await (program.account as any).poolState.fetch(poolPda)
        
        // price_usdc_per_token is u64 representing USDC base units (6 decimals)
        const priceRaw = poolAccount.priceUsdcPerToken as BN
        const priceFloat = Number(priceRaw.toString()) / 1e6
        
        setPrice(priceFloat)
      } catch (e: any) {
        console.error('Error fetching token price:', e)
        setError(e.message || 'Failed to fetch token price')
        setPrice(null)
      } finally {
        setLoading(false)
      }
    }

    fetchPrice()
  }, [program, poolPda])

  return { price, loading, error }
}
