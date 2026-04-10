"use client";

import { FC, ReactNode, useMemo } from "react";
import type { Adapter } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { clusterApiUrl } from "@solana/web3.js";
import { createRateLimitedFetch } from "@/lib/rpc-throttle";

// Import wallet adapter CSS
import "@solana/wallet-adapter-react-ui/styles.css";

interface SolanaProviderConfig {
  autoConnect: boolean;
  env: "mainnet-beta" | "devnet" | "testnet";
  metadata: {
    name: string;
    description: string;
    url: string;
    iconUrls: string[];
  };
  walletlistExplanation: {
    href: string;
  };
  theme: "dark" | "light";
}

interface SolanaProviderProps {
  children: ReactNode;
  wallets?: Adapter[];
  config?: SolanaProviderConfig;
}

export const SolanaProvider: FC<SolanaProviderProps> = ({
  children,
  wallets: providedWallets = [],
  config,
}) => {
  // Keep wallet adapter defaults aligned with the app's testnet deployment.
  const endpoint = useMemo(() => {
    const env = config?.env ?? "testnet";
    return clusterApiUrl(env);
  }, [config?.env]);

  // Configure wallet adapters - use provided wallets or default to Phantom
  const wallets = useMemo(() => {
    if (providedWallets.length > 0) {
      return providedWallets;
    }
    return [new PhantomWalletAdapter()];
  }, [providedWallets]);

  // Rate-limited fetch middleware prevents 429s on public RPC endpoints.
  const fetchMiddleware = useMemo(() => createRateLimitedFetch(), []);

  return (
    <ConnectionProvider
      endpoint={endpoint}
      config={{ fetchMiddleware, disableRetryOnRateLimit: true }}
    >
      <WalletProvider
        wallets={wallets}
        autoConnect={config?.autoConnect ?? true}
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
