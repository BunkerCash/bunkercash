"use client";

import type { ReactNode } from "react";
import { Provider as JotaiProvider } from "jotai";
import { ThemeProvider } from "next-themes";
import { SolanaProvider } from "@/providers/SolanaProvider";
import { ToastProvider } from "@/components/ui/ToastContext";
import { getConfiguredSolanaCluster } from "@/lib/solana-env";

function getWalletEnv(): "mainnet-beta" | "devnet" | "testnet" | "localnet" {
  return getConfiguredSolanaCluster();
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <SolanaProvider
        wallets={[]}
        config={{
          autoConnect: true,
          env: getWalletEnv(),
          metadata: {
            name: "BunkerCash",
            description: "BunkerCash - Tokenized Commodities",
            url: "https://bunkercash.io",
            iconUrls: ["/icon-transparent.png"],
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
    </ThemeProvider>
  );
}
