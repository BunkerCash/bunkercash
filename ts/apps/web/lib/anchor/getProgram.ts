import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "./idl/bunker_cash.json";

// TODO: Replace with actual Devnet program ID
export const PROGRAM_ID = new PublicKey("11111111111111111111111111111111");

/**
 * Get Anchor program instance
 * @param wallet - Wallet adapter instance
 * @returns Configured Anchor program
 */
export function getProgram(wallet: anchor.Wallet) {
  const connection = new anchor.web3.Connection(
    anchor.web3.clusterApiUrl("devnet"),
    "confirmed",
  );

  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  return new anchor.Program(idl as anchor.Idl, provider);
}
