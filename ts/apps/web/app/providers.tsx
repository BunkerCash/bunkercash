"use client";

import type { ReactNode } from "react";
import { Provider as JotaiProvider } from "jotai";
import { SolanaProvider } from "@/providers/SolanaProvider";
import { ToastProvider } from "@/components/ui/ToastContext";

function getWalletEnv(): "mainnet-beta" | "devnet" | "testnet" | "localnet" {
  const env = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  if (
    env === "mainnet-beta" ||
    env === "devnet" ||
    env === "testnet" ||
    env === "localnet"
  ) {
    return env;
  }
  return "devnet";
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
      <JotaiProvider>
        <ToastProvider>{children}</ToastProvider>
      </JotaiProvider>
    </SolanaProvider>
  );
}
