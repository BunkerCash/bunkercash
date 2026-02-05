"use client";

import type { ReactNode } from "react";
import { Provider as JotaiProvider } from "jotai";
import { SolanaProvider } from "@/providers/SolanaProvider";

function getWalletEnv(): "mainnet-beta" | "devnet" | "testnet" {
  // Default to testnet as requested
  return "testnet";
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SolanaProvider
      wallets={[]}
      config={{
        autoConnect: true,
        env: getWalletEnv(),
        metadata: {
          name: "BunkerCash",
          description: "BunkerCash - Tokenized Commodities",
          url: "https://bunkercash.io",
          iconUrls: ["/icon.png"],
        },
        walletlistExplanation: {
          href: "https://station.jup.ag/docs/additional-topics/wallet-list",
        },
        theme: "dark",
      }}
    >
      <JotaiProvider>{children}</JotaiProvider>
    </SolanaProvider>
  );
}
