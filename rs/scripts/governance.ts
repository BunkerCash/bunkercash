import { AnchorProvider } from "@coral-xyz/anchor";
import { fetchData } from "@coral-xyz/anchor/dist/cjs/utils/registry";
import { PublicKey } from "@solana/web3.js";

export const PROGRAM_UPGRADE_AUTHORITY_ENV = "SQUADS_PROGRAM_UPGRADE_AUTHORITY";
export const ALLOW_IMMUTABLE_PROGRAM_ENV = "ALLOW_IMMUTABLE_PROGRAM";

export type UpgradeAuthorityStatus = {
  programId: PublicKey;
  upgradeAuthority: PublicKey | null;
  expectedAuthority: PublicKey;
  isImmutable: boolean;
  isExpectedAuthority: boolean;
};

export function requireProgramUpgradeAuthorityEnv(): PublicKey {
  const raw = process.env[PROGRAM_UPGRADE_AUTHORITY_ENV]?.trim();
  if (!raw) {
    throw new Error(
      `${PROGRAM_UPGRADE_AUTHORITY_ENV} must be set to the confirmed Squads-controlled program upgrade authority.`
    );
  }
  return new PublicKey(raw);
}

export function allowsImmutableProgram(): boolean {
  return process.env[ALLOW_IMMUTABLE_PROGRAM_ENV] === "true";
}

export function clusterLooksMainnet(provider: AnchorProvider): boolean {
  const endpoint = provider.connection.rpcEndpoint.toLowerCase();
  return endpoint.includes("mainnet");
}

export async function getProgramUpgradeAuthority(
  provider: AnchorProvider,
  programId: PublicKey
): Promise<PublicKey | null> {
  const programData = await fetchData(provider.connection, programId);
  return programData.upgradeAuthorityAddress;
}

export async function verifyProgramUpgradeAuthority(params: {
  provider: AnchorProvider;
  programId: PublicKey;
  deployerWallet?: PublicKey;
}): Promise<UpgradeAuthorityStatus> {
  const expectedAuthority = requireProgramUpgradeAuthorityEnv();
  const upgradeAuthority = await getProgramUpgradeAuthority(
    params.provider,
    params.programId
  );
  const isImmutable = upgradeAuthority === null;
  const isExpectedAuthority =
    !!upgradeAuthority && upgradeAuthority.equals(expectedAuthority);

  if (isImmutable && allowsImmutableProgram()) {
    return {
      programId: params.programId,
      upgradeAuthority,
      expectedAuthority,
      isImmutable,
      isExpectedAuthority,
    };
  }

  if (!isExpectedAuthority) {
    const actual = upgradeAuthority ? upgradeAuthority.toBase58() : "none";
    const expected = expectedAuthority.toBase58();
    const deployer = params.deployerWallet?.toBase58();
    const deployerMsg =
      deployer && upgradeAuthority?.equals(params.deployerWallet)
        ? ` Current authority is the deployer wallet (${deployer}).`
        : "";

    throw new Error(
      `Program upgrade authority is not verified. Expected ${expected}, got ${actual}.${deployerMsg}`
    );
  }

  return {
    programId: params.programId,
    upgradeAuthority,
    expectedAuthority,
    isImmutable,
    isExpectedAuthority,
  };
}

export async function assertMainnetFundingAllowed(params: {
  provider: AnchorProvider;
  programId: PublicKey;
  action: string;
}): Promise<void> {
  if (!clusterLooksMainnet(params.provider)) return;

  await verifyProgramUpgradeAuthority({
    provider: params.provider,
    programId: params.programId,
    deployerWallet: params.provider.wallet.publicKey,
  }).catch((e) => {
    throw new Error(
      `Blocked mainnet ${
        params.action
      }: program upgrade authority must be verified before moving funds. ${
        (e as Error).message
      }`
    );
  });
}

export function printUpgradeAuthorityStatus(
  status: UpgradeAuthorityStatus
): void {
  console.log("Program ID:", status.programId.toBase58());
  console.log(
    "Expected upgrade authority:",
    status.expectedAuthority.toBase58()
  );
  console.log(
    "Current upgrade authority:",
    status.upgradeAuthority ? status.upgradeAuthority.toBase58() : "none"
  );
  console.log(
    "Status:",
    status.isImmutable
      ? "immutable"
      : status.isExpectedAuthority
      ? "verified"
      : "unverified"
  );
}
