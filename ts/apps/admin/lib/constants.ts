
import { PublicKey } from "@solana/web3.js";

export type ClusterType = 'mainnet-beta' | 'devnet' | 'testnet' | 'localnet' | 'unknown';

export const USDC_MINTS: Record<string, string> = {
  'mainnet-beta': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'devnet': '2GCh5iHGbw2wwzTsQGxxm39bwwJ6wFsHdsf6ZBTyzpZ3',
  'testnet': '2GCh5iHGbw2wwzTsQGxxm39bwwJ6wFsHdsf6ZBTyzpZ3',
};

export function getClusterFromEndpoint(endpoint: string): ClusterType {
  if (endpoint.includes('devnet')) return 'devnet';
  if (endpoint.includes('testnet')) return 'testnet';
  if (endpoint.includes('mainnet')) return 'mainnet-beta';
  if (endpoint.includes('localhost') || endpoint.includes('127.0.0.1')) return 'localnet';
  return 'unknown';
}

export function getUsdcMintForCluster(cluster: ClusterType): PublicKey | null {
  const envMint = process.env.NEXT_PUBLIC_USDC_MINT;
  if (envMint) return new PublicKey(envMint);

  const mint = USDC_MINTS[cluster];
  if (!mint) return null;
  return new PublicKey(mint);
}
