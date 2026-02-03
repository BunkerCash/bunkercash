"use client";

import { Provider as JotaiProvider } from "jotai";
import { SolanaProvider } from "@/providers/SolanaProvider";

function getWalletEnv(): 'mainnet-beta' | 'devnet' {
  // Default to devnet for now because the Anchor program is deployed there.
  const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'devnet').toLowerCase()
  return cluster === 'mainnet-beta' || cluster === 'mainnet' ? 'mainnet-beta' : 'devnet'
}

const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SolanaProvider>
      <JotaiProvider>{children}</JotaiProvider>
    </SolanaProvider>
  );
}
