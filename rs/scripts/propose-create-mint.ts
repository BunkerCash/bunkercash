/**
 * Propose `create_bunkercash_mint` through the Squads v4 vault that owns the pool.
 *
 * The pool's master_wallet on testnet is the Squads vault PDA (threshold 2-of-3),
 * so the mint can only be created via a vault transaction. This script:
 *   1. builds the create_bunkercash_mint instruction with the vault as admin
 *   2. creates the vault transaction + proposal
 *   3. approves it with the local keypair (1 of 2 required votes)
 *
 * After a second member approves (approve-and-execute-mint-proposal.ts),
 * anyone can execute.
 *
 * Run:
 *   cd ts/apps/web && npx tsx ../../../rs/scripts/propose-create-mint.ts
 * Env (optional): RPC_URL, KEYPAIR_PATH
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { AnchorProvider, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const MULTISIG_PDA = new PublicKey("GD3jX4ixATyMN5QZGfhGZeYgz3b6bgPjSBF3qtzEfYew");
const RPC_URL = process.env.RPC_URL ?? "https://api.testnet.solana.com";
const KEYPAIR_PATH = process.env.KEYPAIR_PATH ?? "~/.config/solana/id.json";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const idlJson = require("../../ts/apps/web/lib/bunkercash.fixed.idl.json") as {
  address: string;
} & Idl;
const PROGRAM_ID = new PublicKey(idlJson.address);

function loadKeypair(path: string): Keypair {
  const file = readFileSync(
    path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path,
    "utf8",
  );
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(file) as number[]));
}

async function main() {
  const keypair = loadKeypair(KEYPAIR_PATH);
  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(keypair), {
    commitment: "confirmed",
  });
  const program = new Program(idlJson as unknown as Idl, provider);

  const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from("pool")], PROGRAM_ID);
  const [mintPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bunkercash_mint")],
    PROGRAM_ID,
  );
  const [vaultPda] = multisig.getVaultPda({ multisigPda: MULTISIG_PDA, index: 0 });

  const existing = await connection.getAccountInfo(mintPda);
  if (existing) {
    console.log("Mint already exists:", mintPda.toBase58());
    return;
  }

  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, MULTISIG_PDA);
  const transactionIndex = BigInt(ms.transactionIndex.toString()) + 1n;
  console.log("Multisig:", MULTISIG_PDA.toBase58());
  console.log("Vault (pool admin):", vaultPda.toBase58());
  console.log("New transaction index:", transactionIndex.toString());

  const createMintIx = await (program.methods as any)
    .createBunkercashMint()
    .accounts({
      pool: poolPda,
      bunkercashMint: mintPda,
      admin: vaultPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const { blockhash } = await connection.getLatestBlockhash();
  const vaultMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: [createMintIx],
  });

  const createVaultTxIx = multisig.instructions.vaultTransactionCreate({
    multisigPda: MULTISIG_PDA,
    transactionIndex,
    creator: keypair.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: vaultMessage,
    memo: "create_bunkercash_mint (testnet bootstrap)",
  });
  const proposalCreateIx = multisig.instructions.proposalCreate({
    multisigPda: MULTISIG_PDA,
    transactionIndex,
    creator: keypair.publicKey,
  });
  const approveIx = multisig.instructions.proposalApprove({
    multisigPda: MULTISIG_PDA,
    transactionIndex,
    member: keypair.publicKey,
  });

  const tx = new Transaction().add(createVaultTxIx, proposalCreateIx, approveIx);
  const sig = await provider.sendAndConfirm(tx, [keypair]);

  const [proposalPda] = multisig.getProposalPda({
    multisigPda: MULTISIG_PDA,
    transactionIndex,
  });
  console.log("\nProposal created and approved by", keypair.publicKey.toBase58());
  console.log("Signature:", sig);
  console.log("Proposal PDA:", proposalPda.toBase58());
  console.log("Transaction index:", transactionIndex.toString());
  console.log(
    "\nNext: a second multisig member must approve, then execute:\n" +
      `  RPC_URL=${RPC_URL} TX_INDEX=${transactionIndex} KEYPAIR_PATH=<member-keypair.json> \\\n` +
      "  npx tsx ../../../rs/scripts/approve-and-execute-mint-proposal.ts",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
