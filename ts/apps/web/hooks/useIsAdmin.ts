"use client"
import { useEffect, useState, useMemo } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { getReadonlyProgram, getPoolPda, PROGRAM_ID } from '@/lib/program'

export function useIsAdmin() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const { publicKey } = wallet
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSquadsMember, setIsSquadsMember] = useState(false)
  const [loading, setLoading] = useState(true)
  const [poolAdmin, setPoolAdmin] = useState<PublicKey | null>(null)
  const [isGovernedBySquads, setIsGovernedBySquads] = useState(false)

  const program = useMemo(() => {
    return getReadonlyProgram(connection)
  }, [connection])

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), [])

  useEffect(() => {
    const fetchAdmin = async () => {
      if (!program) return

      setLoading(true)
      try {
        const accountApi = program.account as {
          pool: { fetch: (pubkey: PublicKey) => Promise<{ masterWallet: PublicKey }> }
        }
        const poolState = await accountApi.pool.fetch(poolPda)
        const adminPubkey = poolState.masterWallet as PublicKey
        setPoolAdmin(adminPubkey)
        setIsGovernedBySquads(false)
        setIsSquadsMember(false)
        setIsAdmin(
          !!publicKey &&
          publicKey.toBase58() === adminPubkey.toBase58()
        )
      } catch (e: unknown) {
        console.error('Error fetching pool admin:', e)
        setPoolAdmin(null)
        setIsAdmin(false)
        setIsSquadsMember(false)
        setIsGovernedBySquads(false)
      } finally {
        setLoading(false)
      }
    }

    fetchAdmin()
  }, [program, poolPda, publicKey, connection])

  return { isAdmin, isSquadsMember, loading, poolAdmin, isGovernedBySquads }
}
