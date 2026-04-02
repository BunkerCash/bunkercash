import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "./idl/bunker_cash.json";

export const PROGRAM_ID = new PublicKey("8f9dGXF3i3BdF41p7jiVKJyFcMToVyS2SyFSHbjaywLQ");

/**
 * Get Anchor program instance
 * @param wallet - Wallet adapter instance
 * @returns Configured Anchor program
 */
export function getProgram(wallet: anchor.Wallet) {
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    anchor.web3.clusterApiUrl("testnet");
  const connection = new anchor.web3.Connection(
    endpoint,
    "confirmed",
  );

  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  return new anchor.Program(idl as anchor.Idl, provider);
}
