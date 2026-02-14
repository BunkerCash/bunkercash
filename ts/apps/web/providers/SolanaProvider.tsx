"use client";

import { FC, ReactNode, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
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
  wallets?: any[];
  config?: SolanaProviderConfig;
}

export const SolanaProvider: FC<SolanaProviderProps> = ({
  children,
  wallets: providedWallets = [],
  config,
}) => {
  // Configure endpoint based on config.env or default to devnet
  const endpoint = useMemo(() => {
    const env = config?.env ?? "devnet";
    return clusterApiUrl(env);
  }, [config?.env]);

  // Configure wallet adapters - use provided wallets or default to Phantom
  const wallets = useMemo(() => {
    if (providedWallets.length > 0) {
      return providedWallets;
    }
    return [new PhantomWalletAdapter()];
  }, [providedWallets]);

  // Rate-limited fetch middleware prevents 429s on devnet's public RPC
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
};;;

