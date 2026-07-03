// Migrations are an early feature. Currently, they're nothing more than this
// single deploy script that's invoked from the CLI, injecting a provider
// configured from the workspace's Anchor.toml.

import * as anchor from "@coral-xyz/anchor";
import { requireProgramUpgradeAuthorityEnv } from "../scripts/governance";

module.exports = async function (provider: anchor.AnchorProvider) {
  // Configure client to use the provider.
  anchor.setProvider(provider);

  const upgradeAuthority = requireProgramUpgradeAuthorityEnv();
  console.log(
    "Program upgrade authority required:",
    upgradeAuthority.toBase58()
  );
  console.log("After deploy, run:");
  console.log(
    "  solana program set-upgrade-authority <PROGRAM_ID> --new-upgrade-authority " +
      upgradeAuthority.toBase58() +
      " --skip-new-upgrade-authority-signer-check"
  );
};
