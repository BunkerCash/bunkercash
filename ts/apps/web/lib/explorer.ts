import type { ClusterType } from "@/lib/constants";

function clusterSuffix(cluster: ClusterType): string {
  return cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
}

export function explorerTxUrl(cluster: ClusterType, signature: string): string {
  return `https://explorer.solana.com/tx/${signature}${clusterSuffix(cluster)}`;
}

export function explorerAddressUrl(
  cluster: ClusterType,
  address: string,
): string {
  return `https://explorer.solana.com/address/${address}${clusterSuffix(cluster)}`;
}

export function clusterLabel(cluster: ClusterType): string {
  switch (cluster) {
    case "mainnet-beta":
      return "Solana Mainnet";
    case "devnet":
      return "Solana Devnet";
    case "testnet":
      return "Solana Testnet";
    default:
      return "Localnet";
  }
}
