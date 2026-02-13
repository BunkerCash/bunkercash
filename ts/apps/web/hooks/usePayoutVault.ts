"use client"
import { useEffect, useState, useMemo } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { getPoolPda, getPoolSignerPda, PROGRAM_ID } from '@/lib/program'

const USDC_DECIMALS = 6
const DEFAULT_DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'

export function usePayoutVault() {
  const { connection } = useConnection()
  const [balance, setBalance] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), [])
  const poolSignerPda = useMemo(() => getPoolSignerPda(poolPda, PROGRAM_ID), [poolPda])
  const usdcMint = useMemo(
    () => new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT ?? DEFAULT_DEVNET_USDC_MINT),
    []
  )

  useEffect(() => {
    if (!connection || !usdcMint) return

    const fetchBalance = async () => {
      setLoading(true)
      setError(null)
      try {
        const payoutUsdcVault = getAssociatedTokenAddressSync(
          usdcMint,
          poolSignerPda,
          true,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )

        const bal = await connection.getTokenAccountBalance(payoutUsdcVault)
        setBalance(bal.value.uiAmountString ?? '0')
      } catch (e: any) {
        console.error('Error fetching payout vault balance:', e)
        // If the account doesn't exist, it might mean no liquidity has been added yet.
        // We can treat this as 0 or an error depending on preference.
        // For a status page, 0 is likely more appropriate if the vault just doesn't exist yet.
        if (e.message?.includes('could not find account')) {
            setBalance('0')
        } else {
            setError(e.message || 'Failed to fetch balance')
            setBalance(null)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchBalance()
    
    // Set up a listener for real-time updates? 
    // For a read-only page, polling or just initial fetch is often enough, 
    // but a listener is nice. However, account change listeners on PDAs/ATAs 
    // can be spammy or tricky if the account doesn't exist yet.
    // Let's stick to initial fetch + simple interval polling if needed, 
    // but for now just initial fetch to satisfy requirements.

  }, [connection, usdcMint, poolSignerPda])

  return { balance, loading, error }
}
