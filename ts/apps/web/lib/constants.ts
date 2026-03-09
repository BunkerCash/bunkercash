
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID as SQUADS_V4_PROGRAM_ID, getVaultPda as getSquadsV4VaultPda } from "@sqds/multisig";

export type ClusterType = 'mainnet-beta' | 'devnet' | 'testnet' | 'localnet' | 'unknown';

// ---------------------------------------------------------------------------
// Squads governance (v4)
// ---------------------------------------------------------------------------
/**
 * Squads **v4** program id.
 * Deployed on devnet at `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`.
 */
export const SQUADS_PROGRAM_ID = SQUADS_V4_PROGRAM_ID;

/**
 * Squads v4 multisig address.
 *
 * Set this in your web app env:
 *   NEXT_PUBLIC_SQUADS_MULTISIG_PUBKEY=<your v4 multisig PDA>
 */
const SQUADS_MULTISIG_STR = process.env.NEXT_PUBLIC_SQUADS_MULTISIG_PUBKEY ?? "";
export const SQUADS_MULTISIG_PUBKEY: PublicKey | null = SQUADS_MULTISIG_STR
  ? new PublicKey(SQUADS_MULTISIG_STR)
  : null;

/**
 * Squads v4 vault index used as the signer PDA for most transactions.
 * Default is 0 (see Squads v4 quickstart).
 */
export const SQUADS_VAULT_INDEX = 0;

/** Squads v4 vault PDA (signer) derived from `SQUADS_MULTISIG_PUBKEY` + `SQUADS_VAULT_INDEX`. */
export const SQUADS_VAULT_PUBKEY: PublicKey | null = SQUADS_MULTISIG_PUBKEY
  ? getSquadsV4VaultPda({ multisigPda: SQUADS_MULTISIG_PUBKEY, index: SQUADS_VAULT_INDEX })[0]
  : null;

/**
 * Returns a deep-link URL to the Squads app for the given cluster.
 *
 * - Mainnet-beta → https://app.squads.so/multisig/<pubkey>
 * - Everything else (devnet / testnet) → https://devnet.squads.so/multisig/<pubkey>
 *
 * When `multisigPda` is omitted the bare app root is returned.
 */
export function getSquadsDashboardUrl(
  cluster?: ClusterType,
  multisigPda?: PublicKey,
): string {
  const base =
    cluster === "mainnet-beta"
      ? "https://app.squads.so"
      : "https://devnet.squads.so";

  if (multisigPda) {
    return `${base}/multisig/${multisigPda.toBase58()}`;
  }
  return base;
}

export const USDC_MINTS: Record<string, string> = {
  'mainnet-beta': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'devnet': 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
  'testnet': 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
};

export function getClusterFromEndpoint(endpoint: string): ClusterType {
  const envCluster = process.env.NEXT_PUBLIC_CLUSTER;
  if (envCluster) return envCluster as ClusterType;

  if (endpoint.includes('devnet')) return 'devnet';
  if (endpoint.includes('testnet')) return 'testnet';
  if (endpoint.includes('mainnet')) return 'mainnet-beta';
  if (endpoint.includes('localhost') || endpoint.includes('127.0.0.1')) return 'localnet';

  // private RPCs (Helius, QuickNode, etc.) often omit the cluster name —
  // default to mainnet-beta since production deployments use private RPCs.
  // override with NEXT_PUBLIC_CLUSTER if this assumption is wrong.
  return 'mainnet-beta';
}

export function getUsdcMintForCluster(cluster: ClusterType): PublicKey | null {
  // Allow env override for flexibility (e.g. NEXT_PUBLIC_USDC_MINT in .env)
  const envMint = process.env.NEXT_PUBLIC_USDC_MINT;
  if (envMint) return new PublicKey(envMint);

  const mint = USDC_MINTS[cluster];
  if (!mint) return null;
  return new PublicKey(mint);
}
