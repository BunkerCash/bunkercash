'use client'

import { Provider as JotaiProvider } from 'jotai'
import { UnifiedWalletProvider } from '@jup-ag/wallet-adapter'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UnifiedWalletProvider
      wallets={[]}
      config={{
        autoConnect: true,
        env: 'mainnet-beta',
        metadata: {
          name: 'BunkerCash',
          description: 'BunkerCash - Tokenized Commodities',
          url: 'https://bunkercash.io',
          iconUrls: ['/icon.png'],
        },
        walletlistExplanation: {
          href: 'https://station.jup.ag/docs/additional-topics/wallet-list',
        },
      }}
    >
      <JotaiProvider>
        {children}
      </JotaiProvider>
    </UnifiedWalletProvider>
  )
}
