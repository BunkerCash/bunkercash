import { useCallback, useEffect, useMemo, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { getBunkercashMintPda, PROGRAM_ID } from '@/lib/program'

export function useTokenBalance() {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const [balance, setBalance] = useState<string>('0')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mintPda = useMemo(() => getBunkercashMintPda(PROGRAM_ID), [])

  const userBunkercashAta = useMemo(() => {
    if (!publicKey) return null
    return getAssociatedTokenAddressSync(
      mintPda,
      publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  }, [publicKey, mintPda])

  const fetchBalance = useCallback(async () => {
    if (!connection || !userBunkercashAta) {
        setBalance('0')
        return
    }
    
    setLoading(true)
    setError(null)
    try {
      const bal = await connection.getTokenAccountBalance(userBunkercashAta, 'confirmed')
      setBalance(bal.value.uiAmountString ?? '0')
    } catch (e: any) {
        // If account doesn't exist, balance is 0
        if (e.message?.includes("could not find account")) {
          setBalance("0");
        } else {
          setError(e.message || "Failed to fetch balance");
          setBalance("0");
        }
      
    } finally {
      setLoading(false)
    }
  }, [connection, userBunkercashAta])

  useEffect(() => {
    fetchBalance()
  }, [fetchBalance])

  return { balance, loading, error, refreshBalance: fetchBalance, userBunkercashAta }
}
