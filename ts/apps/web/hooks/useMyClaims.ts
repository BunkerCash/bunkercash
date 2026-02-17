import { useCallback, useEffect, useMemo, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { getProgram, PROGRAM_ID } from '@/lib/program'

export interface Claim {
  pubkey: PublicKey
  id: string
  tokenAmountLocked: string
  usdcPaid: string
  isClosed: boolean
  createdAt: string
}

export function useMyClaims() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const program = useMemo(() => (wallet.publicKey ? getProgram(connection, wallet) : null), [connection, wallet])

  const fetchClaims = useCallback(async () => {
    if (!program || !wallet.publicKey) {
        setClaims([])
        return
    }
    
    setLoading(true)
    setError(null)
    try {
      // ClaimState: fetch all and filter by user (memcmp on pubkey varies by RPC)
      // TODO: Optimize with memcmp filters when index is ready
      const all = await (program.account as any).claimState.all()
      const mine = all.filter(
        (x: any) => (x.account.user as PublicKey)?.toBase58?.() === wallet.publicKey!.toBase58()
      )
      const normalized = mine
        .map((x: any) => ({
          pubkey: x.publicKey as PublicKey,
          id: x.account.id?.toString?.() ?? String(x.account.id),
          tokenAmountLocked: x.account.tokenAmountLocked?.toString?.() ?? String(x.account.tokenAmountLocked),
          usdcPaid: x.account.usdcPaid?.toString?.() ?? String(x.account.usdcPaid),
          isClosed: Boolean(x.account.isClosed),
          createdAt: x.account.createdAt?.toString?.() ?? String(x.account.createdAt),
        }))
        .sort((a: any, b: any) => Number(b.id) - Number(a.id))
      setClaims(normalized)
    } catch (e: any) {
        setError(e.message || "Failed to fetch claims")
    } finally {
        setLoading(false)
    }
  }, [program, wallet.publicKey])

  useEffect(() => {
    fetchClaims()
  }, [fetchClaims])

  return { claims, loading, error, refreshClaims: fetchClaims }
}
