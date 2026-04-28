import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "./idl/bunker_cash.json";
import { getConfiguredRpcCluster } from "@/lib/solana-env";

const idlWithAddress = idl as anchor.Idl & { address: string };
export const PROGRAM_ID = new PublicKey(idlWithAddress.address);

/**
 * Get Anchor program instance
 * @param wallet - Wallet adapter instance
 * @returns Configured Anchor program
 */
export function getProgram(wallet: anchor.Wallet) {
  const cluster = getConfiguredRpcCluster();
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    anchor.web3.clusterApiUrl(cluster);
  const connection = new anchor.web3.Connection(
    endpoint,
    "confirmed",
  );

  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  return new anchor.Program(idlWithAddress as anchor.Idl, provider);
}
