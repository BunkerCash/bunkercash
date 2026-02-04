"use client";

import { Provider as JotaiProvider } from "jotai";
import { SolanaProvider } from "@/providers/SolanaProvider";

function getWalletEnv(): "mainnet-beta" | "devnet" | "testnet" {
  // Default to devnet (program is deployed there)
  return "devnet";
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SolanaProvider
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
