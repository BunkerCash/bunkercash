"use client"
import { useEffect, useState, useMemo } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import * as multisig from '@sqds/multisig'
import { getProgram, getReadonlyProgram, getPoolPda, PROGRAM_ID } from '@/lib/program'
import { SQUADS_MULTISIG_PUBKEY, SQUADS_VAULT_PUBKEY } from '@/lib/constants'

export function useIsAdmin() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSquadsMember, setIsSquadsMember] = useState(false)
  const [loading, setLoading] = useState(true)
  const [poolAdmin, setPoolAdmin] = useState<PublicKey | null>(null)
  const [isGovernedBySquads, setIsGovernedBySquads] = useState(false)

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

        const governed =
          (SQUADS_MULTISIG_PUBKEY != null && adminPubkey.equals(SQUADS_MULTISIG_PUBKEY)) ||
          (SQUADS_VAULT_PUBKEY != null && adminPubkey.equals(SQUADS_VAULT_PUBKEY))
        setIsGovernedBySquads(governed)

        if (governed && wallet.publicKey && SQUADS_MULTISIG_PUBKEY) {
          // When the pool is governed by Squads, any multisig member is
          // treated as an "admin" in the UI — they can propose transactions.
          try {
            const ms = await multisig.accounts.Multisig.fromAccountAddress(
              connection,
              SQUADS_MULTISIG_PUBKEY,
            )
            const isMember = ms.members.some((m) => m.key.equals(wallet.publicKey!))
            setIsSquadsMember(isMember)
            setIsAdmin(isMember)
          } catch (memberErr) {
            console.warn('Could not verify Squads membership:', memberErr)
            setIsSquadsMember(false)
            setIsAdmin(false)
          }
        } else {
          // Pre-governance: direct wallet admin
          setIsSquadsMember(false)
          setIsAdmin(
            !!wallet.publicKey &&
            wallet.publicKey.toBase58() === adminPubkey.toBase58()
          )
        }
      } catch (e: any) {
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
  }, [program, poolPda, wallet.publicKey, connection])

  return { isAdmin, isSquadsMember, loading, poolAdmin, isGovernedBySquads }
}
