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

import "@solana/wallet-adapter-react-ui/styles.css";

export const SolanaProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const endpoint = useMemo(
    () =>
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      process.env.NEXT_PUBLIC_RPC_ENDPOINT ||
      clusterApiUrl("devnet"),
    []
  );
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  const fetchMiddleware = useMemo(() => createRateLimitedFetch(), []);

  return (
    <ConnectionProvider
      endpoint={endpoint}
      config={{ fetchMiddleware, disableRetryOnRateLimit: true }}
    >
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
