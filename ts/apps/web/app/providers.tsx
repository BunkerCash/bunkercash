"use client";

import { Provider as JotaiProvider } from "jotai";
import { SolanaProvider } from "@/providers/SolanaProvider";

function getWalletEnv(): "mainnet-beta" | "devnet" {
  // Default to devnet for now because the Anchor program is deployed there.
  const cluster = (
    process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet"
  ).toLowerCase();
  return cluster === "mainnet-beta" || cluster === "mainnet"
    ? "mainnet-beta"
    : "devnet";
}

export function Providers({ children }: { children: React.ReactNode }) {
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
