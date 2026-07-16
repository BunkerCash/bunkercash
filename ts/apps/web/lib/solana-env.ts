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

// builds a helius rpc url for the given cluster
function buildHeliusUrl(cluster: SolanaCluster, key: string): string {
  const subdomain = cluster === "mainnet-beta" ? "mainnet" : cluster;
  return `https://${subdomain}.helius-rpc.com/?api-key=${key}`;
}

// Resolves the server-side RPC endpoint. Helius does not expose a Solana
// testnet endpoint, so testnet always uses the configured/default RPC.
export function getServerRpcEndpoint(): string {
  const cluster = getConfiguredRpcCluster();
  const heliusKey = process.env.HELIUS_RPC_KEY;
  if (heliusKey && cluster !== "testnet") {
    return buildHeliusUrl(cluster, heliusKey);
  }
  return (
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    process.env.NEXT_PUBLIC_RPC_ENDPOINT ||
    clusterApiUrl(cluster)
  );
}
