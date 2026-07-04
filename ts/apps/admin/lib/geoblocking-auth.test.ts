import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";

const mocks = vi.hoisted(() => ({
  poolMasterWallet: "",
  squadsMembers: [] as Array<{
    key: PublicKey;
    permissions: { mask: number };
  }>,
  fetchPool: vi.fn(),
  fetchMultisig: vi.fn(),
}));

vi.mock("./program", () => ({
  getPoolPda: () => Keypair.generate().publicKey,
  getReadonlyProgram: () => ({
    account: {
      pool: {
        fetch: mocks.fetchPool,
      },
    },
  }),
}));

vi.mock("./solana-env", () => ({
  getConfiguredRpcCluster: () => "devnet",
}));

vi.mock("@sqds/multisig", async () => {
  const actual = await vi.importActual<typeof import("@sqds/multisig")>(
    "@sqds/multisig",
  );
  return {
    ...actual,
    accounts: {
      ...actual.accounts,
      Multisig: {
        ...actual.accounts.Multisig,
        fromAccountAddress: mocks.fetchMultisig,
      },
    },
  };
});

const originalEnv = { ...process.env };

const multisigPda = Keypair.generate().publicKey;
const [vaultPda] = await import("@sqds/multisig").then((squads) =>
  squads.getVaultPda({ multisigPda, index: 0 }),
);
const singleWalletAdmin = Keypair.generate().publicKey;
const memberWallet = Keypair.generate().publicKey;
const nonMemberWallet = Keypair.generate().publicKey;

async function importAuth() {
  vi.resetModules();
  return import("./geoblocking-auth");
}

function setPoolMasterWallet(value: PublicKey) {
  mocks.poolMasterWallet = value.toBase58();
  mocks.fetchPool.mockImplementation(async () => ({
    masterWallet: {
      toBase58: () => mocks.poolMasterWallet,
    },
  }));
}

function setSquadsMembers(
  members: Array<{ key: PublicKey; permissions?: { mask: number } }>,
) {
  mocks.squadsMembers = members.map((member) => ({
    key: member.key,
    permissions: member.permissions ?? { mask: 0 },
  }));
  mocks.fetchMultisig.mockImplementation(async () => ({
    members: mocks.squadsMembers,
  }));
}

describe("admin authority resolution", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.SQUADS_MULTISIG_PUBKEY;
    delete process.env.NEXT_PUBLIC_SQUADS_MULTISIG_PUBKEY;
    delete process.env.SQUADS_VAULT_INDEX;
    delete process.env.ADMIN_SQUADS_REQUIRED_PERMISSION;
    delete process.env.ADMIN_OVERRIDE_WALLET;
    delete process.env.ADMIN_AUTHORITY_TTL_MS;
    setPoolMasterWallet(singleWalletAdmin);
    setSquadsMembers([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  it("authorizes the direct pool authority in single-wallet mode", async () => {
    const { resolveAdminIdentity } = await importAuth();

    const admin = await resolveAdminIdentity(singleWalletAdmin.toBase58());
    const outsider = await resolveAdminIdentity(nonMemberWallet.toBase58());

    expect(admin).toMatchObject({
      isAdmin: true,
      role: "single-wallet",
      governanceMode: "single-wallet",
      poolMasterWallet: singleWalletAdmin.toBase58(),
    });
    expect(outsider).toMatchObject({
      isAdmin: false,
      role: "none",
      governanceMode: "single-wallet",
    });
    expect(mocks.fetchMultisig).not.toHaveBeenCalled();
  });

  it("authorizes a current Squads member when the pool authority is the Squads vault", async () => {
    process.env.SQUADS_MULTISIG_PUBKEY = multisigPda.toBase58();
    setPoolMasterWallet(vaultPda);
    setSquadsMembers([{ key: memberWallet }]);
    const { resolveAdminIdentity } = await importAuth();

    const identity = await resolveAdminIdentity(memberWallet.toBase58());

    expect(identity).toMatchObject({
      wallet: memberWallet.toBase58(),
      isAdmin: true,
      role: "squads-member",
      governanceMode: "squads-v4",
      poolMasterWallet: vaultPda.toBase58(),
      squadsMultisig: multisigPda.toBase58(),
      squadsVault: vaultPda.toBase58(),
      squadsVaultIndex: 0,
    });
  });

  it("rejects a non-member when the pool authority is the Squads vault", async () => {
    process.env.SQUADS_MULTISIG_PUBKEY = multisigPda.toBase58();
    setPoolMasterWallet(vaultPda);
    setSquadsMembers([{ key: memberWallet }]);
    const { resolveAdminIdentity } = await importAuth();

    const identity = await resolveAdminIdentity(nonMemberWallet.toBase58());

    expect(identity).toMatchObject({
      wallet: nonMemberWallet.toBase58(),
      isAdmin: false,
      role: "none",
      governanceMode: "squads-v4",
    });
  });

  it("drops access for a removed Squads member after the authority cache expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T10:00:00.000Z"));
    process.env.ADMIN_AUTHORITY_TTL_MS = "1";
    process.env.SQUADS_MULTISIG_PUBKEY = multisigPda.toBase58();
    setPoolMasterWallet(vaultPda);
    setSquadsMembers([{ key: memberWallet }]);
    const { resolveAdminIdentity } = await importAuth();

    await expect(resolveAdminIdentity(memberWallet.toBase58())).resolves.toMatchObject({
      isAdmin: true,
      role: "squads-member",
    });

    setSquadsMembers([]);
    vi.advanceTimersByTime(2);

    await expect(resolveAdminIdentity(memberWallet.toBase58())).resolves.toMatchObject({
      isAdmin: false,
      role: "none",
    });
    expect(mocks.fetchMultisig).toHaveBeenCalledTimes(2);
  });

  it("honors the optional required Squads permission", async () => {
    process.env.SQUADS_MULTISIG_PUBKEY = multisigPda.toBase58();
    process.env.ADMIN_SQUADS_REQUIRED_PERMISSION = "execute";
    setPoolMasterWallet(vaultPda);
    setSquadsMembers([
      { key: memberWallet, permissions: { mask: 2 } },
      { key: nonMemberWallet, permissions: { mask: 4 } },
    ]);
    const { resolveAdminIdentity } = await importAuth();

    await expect(resolveAdminIdentity(memberWallet.toBase58())).resolves.toMatchObject({
      isAdmin: false,
      role: "none",
      squadsPermissions: ["vote"],
    });
    await expect(resolveAdminIdentity(nonMemberWallet.toBase58())).resolves.toMatchObject({
      isAdmin: true,
      role: "squads-member",
      squadsPermissions: ["execute"],
    });
  });
});
