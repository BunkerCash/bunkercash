/**
 * Propose `init_mint_metadata` through the Squads v4 vault that owns the pool.
 * Same governance flow as propose-create-mint.ts: creates the vault transaction
 * + proposal and casts the local keypair's approval (1 of 2). A second member
 * then runs approve-and-execute-mint-proposal.ts with the printed TX_INDEX.
 *
 * Run:
 *   cd ts/apps/web && npx tsx ../../../rs/scripts/propose-init-metadata.ts
 * Env (optional): RPC_URL, KEYPAIR_PATH, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_URI
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { AnchorProvider, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionMessage,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const MULTISIG_PDA = new PublicKey("GD3jX4ixATyMN5QZGfhGZeYgz3b6bgPjSBF3qtzEfYew");
const RPC_URL = process.env.RPC_URL ?? "https://api.testnet.solana.com";
const KEYPAIR_PATH = process.env.KEYPAIR_PATH ?? "~/.config/solana/id.json";
const TOKEN_NAME = process.env.TOKEN_NAME ?? "BunkerCash";
const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL ?? "BNKR";
const TOKEN_URI =
  process.env.TOKEN_URI ?? "https://bunkercash.com/bunkercash-metadata.json";

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
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBytes(), mintPda.toBytes()],
    TOKEN_METADATA_PROGRAM_ID,
  );
  const [vaultPda] = multisig.getVaultPda({ multisigPda: MULTISIG_PDA, index: 0 });

  const existing = await connection.getAccountInfo(metadataPda);
  if (existing) {
    console.log("Metadata already exists:", metadataPda.toBase58());
    return;
  }

  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, MULTISIG_PDA);
  const transactionIndex = BigInt(ms.transactionIndex.toString()) + 1n;
  console.log("Metadata PDA:", metadataPda.toBase58());
  console.log("Name/Symbol/URI:", TOKEN_NAME, "/", TOKEN_SYMBOL, "/", TOKEN_URI);
  console.log("New transaction index:", transactionIndex.toString());

  const metadataIx = await (program.methods as any)
    .initMintMetadata(TOKEN_NAME, TOKEN_SYMBOL, TOKEN_URI)
    .accounts({
      pool: poolPda,
      bunkercashMint: mintPda,
      admin: vaultPda,
      metadata: metadataPda,
    })
    .instruction();

  const { blockhash } = await connection.getLatestBlockhash();
  const vaultMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: [metadataIx],
  });

  const createVaultTxIx = multisig.instructions.vaultTransactionCreate({
    multisigPda: MULTISIG_PDA,
    transactionIndex,
    creator: keypair.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: vaultMessage,
    memo: "init_mint_metadata (testnet bootstrap)",
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

  console.log("\nProposal created and approved by", keypair.publicKey.toBase58());
  console.log("Signature:", sig);
  console.log("Transaction index:", transactionIndex.toString());
  console.log(
    "\nNext: second member approves + executes:\n" +
      `  TX_INDEX=${transactionIndex} KEYPAIR_PATH=<member-key-file> \\\n` +
      "  npx tsx ../../../rs/scripts/approve-and-execute-mint-proposal.ts",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
