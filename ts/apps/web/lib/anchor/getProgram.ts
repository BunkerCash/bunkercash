import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "./idl/bunker_cash.json";

export const PROGRAM_ID = new PublicKey("G5Vb57tzpH1FvqrqDiPqNeZka7VbexAYWnPW5EmwF3Ld");

/**
 * Get Anchor program instance
 * @param wallet - Wallet adapter instance
 * @returns Configured Anchor program
 */
export function getProgram(wallet: anchor.Wallet) {
  const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet") as Parameters<typeof anchor.web3.clusterApiUrl>[0];
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

  return new anchor.Program(idl as anchor.Idl, provider);
}
