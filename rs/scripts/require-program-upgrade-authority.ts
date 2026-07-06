import { requireProgramUpgradeAuthorityEnv } from "./governance";

function main() {
  const authority = requireProgramUpgradeAuthorityEnv();
  console.log("Program upgrade authority configured:", authority.toBase58());
}

try {
  main();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
