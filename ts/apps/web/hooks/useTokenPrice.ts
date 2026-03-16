"use client"
import { useEffect, useState, useMemo } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { getReadonlyProgram, getPoolPda, PROGRAM_ID } from '@/lib/program'
import { PublicKey } from '@solana/web3.js'

interface Stringable {
  toString(): string
}

interface PoolAccount {
  masterWallet: PublicKey
  nav: Stringable
  totalBrentSupply: Stringable
}

function derivePrice(navRaw: bigint, supplyRaw: bigint): number {
  if (supplyRaw === BigInt(0)) return 1
  return Number(navRaw) / Number(supplyRaw)
}

export function useTokenPrice() {
  const { connection } = useConnection()
  const [price, setPrice] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const program = useMemo(() => getReadonlyProgram(connection), [connection])

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), [])

  useEffect(() => {
    const fetchPrice = async () => {
      if (!program) return
      
      setLoading(true)
      setError(null)
      try {
        const accountApi = program.account as {
          pool: { fetch: (pubkey: PublicKey) => Promise<PoolAccount> }
        }
        const poolAccount = await accountApi.pool.fetch(poolPda)
        const priceFloat = derivePrice(
          BigInt(poolAccount.nav.toString()),
          BigInt(poolAccount.totalBrentSupply.toString())
        )

        setPrice(priceFloat)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to fetch token price')
        setPrice(null)
      } finally {
        setLoading(false)
      }
    }

    fetchPrice()
  }, [program, poolPda])

  return { price, loading, error }
}
