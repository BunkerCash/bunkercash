"use client"
import { useEffect, useState, useMemo } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { getProgram, getReadonlyProgram, getPoolPda, PROGRAM_ID } from '@/lib/program'

export function useIsAdmin() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [poolAdmin, setPoolAdmin] = useState<PublicKey | null>(null)

  const program = useMemo(() => {
    if (wallet.publicKey) {
      return getProgram(connection, wallet)
    }
    return getReadonlyProgram(connection)
  }, [connection, wallet.publicKey])

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), [])

  useEffect(() => {
    const fetchAdmin = async () => {
      if (!program) return

      setLoading(true)
      try {
        const poolState = await (program.account as any).poolState.fetch(poolPda)
        const adminPubkey = poolState.admin as PublicKey
        setPoolAdmin(adminPubkey)
        setIsAdmin(
          !!wallet.publicKey &&
          wallet.publicKey.toBase58() === adminPubkey.toBase58()
        )
      } catch (e: any) {
        console.error('Error fetching pool admin:', e)
        setPoolAdmin(null)
        setIsAdmin(false)
      } finally {
        setLoading(false)
      }
    }

    fetchAdmin()
  }, [program, poolPda, wallet.publicKey])

  return { isAdmin, loading, poolAdmin }
}
