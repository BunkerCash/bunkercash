/**
 * Deploys the BunkerCash program and immediately hands program upgrade authority
 * to the configured Squads-controlled authority.
 *
 * Required:
 *   SQUADS_PROGRAM_UPGRADE_AUTHORITY=<confirmed-squads-controlled-authority>
 */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, type Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { spawnSync } from "child_process";
import {
  getProgramUpgradeAuthority,
  printUpgradeAuthorityStatus,
  requireProgramUpgradeAuthorityEnv,
  verifyProgramUpgradeAuthority,
} from "./governance";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const idlJson = require("../../ts/apps/web/lib/bunkercash.fixed.idl.json") as {
  address: string;
} & Idl;

function run(cmd: string, args: string[]) {
  console.log(`\n$ ${[cmd, ...args].join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed with status ${result.status}`
    );
  }
}

async function main() {
  const programId = new PublicKey(idlJson.address);
  const expectedAuthority = requireProgramUpgradeAuthorityEnv();

  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  console.log("Program ID:", programId.toBase58());
  console.log("Configured upgrade authority:", expectedAuthority.toBase58());

  run("anchor", ["deploy"]);

  const currentAuthority = await getProgramUpgradeAuthority(
    provider,
    programId
  );
  if (currentAuthority?.equals(expectedAuthority)) {
    console.log(
      "\nProgram upgrade authority already matches configured authority."
    );
  } else if (currentAuthority === null) {
    console.log("\nProgram is immutable; no authority transfer is possible.");
  } else {
    run("solana", [
      "program",
      "set-upgrade-authority",
      programId.toBase58(),
      "--new-upgrade-authority",
      expectedAuthority.toBase58(),
      "--skip-new-upgrade-authority-signer-check",
    ]);
  }

  const status = await verifyProgramUpgradeAuthority({
    provider,
    programId,
    deployerWallet: provider.wallet.publicKey,
  });
  printUpgradeAuthorityStatus(status);
  console.log(`CLI check: solana program show ${programId.toBase58()}`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
