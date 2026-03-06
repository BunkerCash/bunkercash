/**
 * Creates a Squads v4 multisig on devnet and prints:
 * - multisig PDA
 * - vault PDA (index 0)
 *
 * Run:
 *   cd rs
 *   export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
 *   export ANCHOR_WALLET=~/.config/solana/id.json
 *   export MEMBER_2_PUBKEY=<base58>
 *   # optional:
 *   export MEMBER_3_PUBKEY=<base58>
 *   export MEMBER_4_PUBKEY=<base58>
 *   export THRESHOLD=2
 *   npx ts-node -P tsconfig.json scripts/create-squads-v4-multisig.ts
 */
import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { AnchorProvider } from "@coral-xyz/anchor";

type MemberInput = { key: PublicKey; permissions: multisig.types.Permissions };

function mustPubkey(envKey: string): PublicKey {
  const v = process.env[envKey];
  if (!v) throw new Error(`Missing ${envKey}`);
  return new PublicKey(v);
}

async function main() {
  const provider = AnchorProvider.env();
  const connection: Connection = provider.connection;
  const creator = provider.wallet as unknown as { publicKey: PublicKey; payer: Keypair };

  const threshold = Number(process.env.THRESHOLD ?? "2");
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new Error("THRESHOLD must be a positive number");
  }

  const createKey = Keypair.generate();
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
  const programConfigPda = multisig.getProgramConfigPda({})[0];
  const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(connection, programConfigPda);

  const members: MemberInput[] = [
    { key: creator.publicKey, permissions: multisig.types.Permissions.all() },
    { key: mustPubkey("MEMBER_2_PUBKEY"), permissions: multisig.types.Permissions.all() },
  ];

  for (const k of ["MEMBER_3_PUBKEY", "MEMBER_4_PUBKEY"] as const) {
    const v = process.env[k];
    if (v) members.push({ key: new PublicKey(v), permissions: multisig.types.Permissions.all() });
  }

  const sig = await multisig.rpc.multisigCreateV2({
    connection,
    createKey,
    creator: creator.payer,
    multisigPda,
    configAuthority: null,
    timeLock: 0,
    members,
    threshold,
    rentCollector: null,
    treasury: programConfig.treasury,
    sendOptions: { skipPreflight: true },
  });

  await connection.confirmTransaction(sig, "confirmed");

  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });

  console.log("Squads v4 multisig created");
  console.log("  tx:", sig);
  console.log("  multisig:", multisigPda.toBase58());
  console.log("  vault(0):", vaultPda.toBase58());
  console.log("\nSet this in ts/apps/web/.env.local:");
  console.log(`  NEXT_PUBLIC_SQUADS_MULTISIG_PUBKEY=${multisigPda.toBase58()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

