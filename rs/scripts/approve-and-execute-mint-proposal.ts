/**
 * Approve (if needed) and execute a pending Squads v4 vault transaction.
 *
 * Intended for the second multisig member to approve the create_bunkercash_mint
 * proposal created by propose-create-mint.ts, and execute it once the 2-of-3
 * threshold is met. Safe to run with the original proposer's key too — it skips
 * the vote if the member already approved and just attempts execution.
 *
 * Run:
 *   cd ts/apps/web && TX_INDEX=<index> KEYPAIR_PATH=<member-keypair.json> \
 *     npx tsx ../../../rs/scripts/approve-and-execute-mint-proposal.ts
 * Env: RPC_URL (default testnet), TX_INDEX (required), KEYPAIR_PATH
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import bs58 from "bs58";

const MULTISIG_PDA = new PublicKey("GD3jX4ixATyMN5QZGfhGZeYgz3b6bgPjSBF3qtzEfYew");
const RPC_URL = process.env.RPC_URL ?? "https://api.testnet.solana.com";
const KEYPAIR_PATH = process.env.KEYPAIR_PATH ?? "~/.config/solana/id.json";

/** Accepts a solana-keygen JSON array file OR a base58 private-key string
 *  (the format Phantom/Solflare export) on a single line. */
function loadKeypair(path: string): Keypair {
  const file = readFileSync(
    path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path,
    "utf8",
  ).trim();
  if (file.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(file) as number[]));
  }
  return Keypair.fromSecretKey(bs58.decode(file));
}

async function main() {
  const txIndexRaw = process.env.TX_INDEX;
  if (!txIndexRaw) throw new Error("TX_INDEX env var is required");
  const transactionIndex = BigInt(txIndexRaw);

  const keypair = loadKeypair(KEYPAIR_PATH);
  const connection = new Connection(RPC_URL, "confirmed");

  const [proposalPda] = multisig.getProposalPda({
    multisigPda: MULTISIG_PDA,
    transactionIndex,
  });
  const proposal = await multisig.accounts.Proposal.fromAccountAddress(
    connection,
    proposalPda,
  );
  const approved = proposal.approved.map((k) => k.toBase58());
  console.log("Proposal:", proposalPda.toBase58());
  console.log("Current approvals:", approved.join(", ") || "(none)");

  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, MULTISIG_PDA);
  const threshold = ms.threshold;

  if (!approved.includes(keypair.publicKey.toBase58())) {
    const approveIx = multisig.instructions.proposalApprove({
      multisigPda: MULTISIG_PDA,
      transactionIndex,
      member: keypair.publicKey,
    });
    const tx = new Transaction().add(approveIx);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = keypair.publicKey;
    tx.sign(keypair);
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
    console.log("Approved. Signature:", sig);
  } else {
    console.log("This member already approved — skipping vote.");
  }

  const refreshed = await multisig.accounts.Proposal.fromAccountAddress(
    connection,
    proposalPda,
  );
  if (refreshed.approved.length < threshold) {
    console.log(
      `Approvals ${refreshed.approved.length}/${threshold} — threshold not met yet, cannot execute.`,
    );
    return;
  }

  const { instruction: executeIx, lookupTableAccounts } =
    await multisig.instructions.vaultTransactionExecute({
      connection,
      multisigPda: MULTISIG_PDA,
      transactionIndex,
      member: keypair.publicKey,
    });

  const tx = new Transaction().add(executeIx);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = keypair.publicKey;
  tx.sign(keypair);
  void lookupTableAccounts;
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  console.log("Executed. Signature:", sig);

  const idlJson = require("../../ts/apps/web/lib/bunkercash.fixed.idl.json") as {
    address: string;
  };
  const [mintPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bunkercash_mint")],
    new PublicKey(idlJson.address),
  );
  const mintInfo = await connection.getAccountInfo(mintPda);
  console.log(
    "Mint PDA",
    mintPda.toBase58(),
    mintInfo ? "now exists — buy flow is unblocked." : "still missing (execution may have failed).",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
