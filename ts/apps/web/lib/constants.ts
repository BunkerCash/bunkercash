
import { PublicKey } from "@solana/web3.js";

export type ClusterType = 'mainnet-beta' | 'devnet' | 'testnet' | 'localnet' | 'unknown';

export const USDC_MINTS: Record<string, string> = {
  'mainnet-beta': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'devnet': '2GCh5iHGbw2wwzTsQGxxm39bwwJ6wFsHdsf6ZBTyzpZ3',  // Custom devnet USDC mint (matches bootstrap script)
  'testnet': '2GCh5iHGbw2wwzTsQGxxm39bwwJ6wFsHdsf6ZBTyzpZ3',  // Same as devnet for testing
};

export function getClusterFromEndpoint(endpoint: string): ClusterType {
  if (endpoint.includes('devnet')) return 'devnet';
  if (endpoint.includes('testnet')) return 'testnet';
  if (endpoint.includes('mainnet')) return 'mainnet-beta';
  if (endpoint.includes('localhost') || endpoint.includes('127.0.0.1')) return 'localnet';
  
  // If we can't detect, fallback to checking if it looks like mainnet (e.g. private RPCs often don't have 'mainnet' in URL)
  // For safety, we return unknown or maybe mainnet-beta if we want to default to prod. 
  // Given the requirement "If the cluster cannot be determined, show a clear error", let's return 'unknown'.
  return 'unknown';
}

export function getUsdcMintForCluster(cluster: ClusterType): PublicKey | null {
  // Allow env override for flexibility (e.g. NEXT_PUBLIC_USDC_MINT in .env)
  const envMint = process.env.NEXT_PUBLIC_USDC_MINT;
  if (envMint) return new PublicKey(envMint);

  const mint = USDC_MINTS[cluster];
  if (!mint) return null;
  return new PublicKey(mint);
}
