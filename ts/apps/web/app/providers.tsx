'use client'

import { Provider as JotaiProvider } from 'jotai'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets'
import { useMemo } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => 'https://api.mainnet-beta.solana.com', [])
  const wallets = useMemo(() => [new PhantomWalletAdapter()], [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <JotaiProvider>
            {children}
          </JotaiProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
