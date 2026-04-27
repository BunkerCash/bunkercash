"use client";

import { FC, ReactNode, useMemo, type ComponentProps } from "react";
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
  env: "mainnet-beta" | "devnet" | "testnet" | "localnet";
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
  wallets?: ComponentProps<typeof WalletProvider>["wallets"];
  config?: SolanaProviderConfig;
}

export const SolanaProvider: FC<SolanaProviderProps> = ({
  children,
  wallets: providedWallets = [],
  config,
}) => {
  const endpoint = useMemo(() => {
    const configuredEndpoint =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      process.env.NEXT_PUBLIC_RPC_ENDPOINT;
    if (configuredEndpoint) {
      return configuredEndpoint;
    }

    const env = config?.env ?? "devnet";
    if (env === "localnet") {
      return "http://127.0.0.1:8899";
    }
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
