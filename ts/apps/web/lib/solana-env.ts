import { clusterApiUrl } from "@solana/web3.js";

export type SolanaCluster = "mainnet-beta" | "devnet" | "testnet";
export type SolanaWalletCluster = SolanaCluster | "localnet";

export function getConfiguredSolanaCluster(): SolanaWalletCluster {
  const cluster =
    process.env.NEXT_PUBLIC_SOLANA_CLUSTER ??
    process.env.NEXT_PUBLIC_CLUSTER;

  if (
    cluster === "mainnet-beta" ||
    cluster === "devnet" ||
    cluster === "testnet" ||
    cluster === "localnet"
  ) {
    return cluster;
  }

  return "devnet";
}

export function getConfiguredRpcCluster(): SolanaCluster {
  const cluster = getConfiguredSolanaCluster();
  return cluster === "localnet" ? "devnet" : cluster;
}
