import { createHash } from "crypto";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import {
  ADMIN_AUTH_SIGNATURE_TTL_MS,
  buildAdminAccessMessage,
  type AdminAuthRequestChallenge,
} from "./admin-auth-message";
import { consumeAdminAuthNonce } from "./admin-auth-nonce";
import { getPoolPda, getReadonlyProgram } from "./program";
import { getConfiguredRpcCluster } from "./solana-env";

const CLOCK_SKEW_TOLERANCE_MS = 30 * 1000; // allow 30 s of clock skew for future timestamps
const ADMIN_AUTHORITY_TTL_MS = Number(process.env.ADMIN_AUTHORITY_TTL_MS ?? 30 * 1000);
const ADMIN_AUTHORITY_FAILURE_BACKOFF_MS = 15 * 1000;

interface PoolAccountLike {
  masterWallet: { toBase58: () => string };
}

export type AdminGovernanceMode = "single-wallet" | "squads-v4";
export type AdminRole = "single-wallet" | "squads-member" | "override" | "none";

export interface AdminIdentity {
  wallet: string;
  isAdmin: boolean;
  role: AdminRole;
  governanceMode: AdminGovernanceMode;
  poolMasterWallet: string;
  squadsMultisig: string | null;
  squadsVault: string | null;
  squadsVaultIndex: number | null;
  squadsPermissions: string[];
}

interface SquadsMemberSnapshot {
  wallet: string;
  permissions: string[];
}

interface AdminAuthorityState {
  poolMasterWallet: string;
  governanceMode: AdminGovernanceMode;
  squadsMultisig: string | null;
  squadsVault: string | null;
  squadsVaultIndex: number | null;
  squadsMembers: SquadsMemberSnapshot[];
}

let adminAuthorityCache: { state: AdminAuthorityState; ts: number } | null = null;
let adminAuthorityPromise: Promise<AdminAuthorityState> | null = null;
let adminAuthorityFailureTs = 0;

function getRpcEndpoints(): string[] {
  const cluster = getConfiguredRpcCluster();
  const endpoints = [
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      process.env.NEXT_PUBLIC_RPC_ENDPOINT ||
      clusterApiUrl(cluster),
    clusterApiUrl(cluster),
    ...(cluster === "testnet" ? ["https://solana-testnet-rpc.publicnode.com"] : []),
  ];
  return [...new Set(endpoints.filter(Boolean))];
}

function withAdminOverride(wallets: Iterable<string>): Set<string> {
  const resolved = new Set(wallets);
  const override = process.env.ADMIN_OVERRIDE_WALLET?.trim();
  if (override) {
    resolved.add(override);
  }
  return resolved;
}

function getConfiguredSquadsMultisig(): PublicKey | null {
  const value =
    process.env.SQUADS_MULTISIG_PUBKEY?.trim() ||
    process.env.NEXT_PUBLIC_SQUADS_MULTISIG_PUBKEY?.trim();
  return value ? new PublicKey(value) : null;
}

function getConfiguredSquadsVaultIndex(): number {
  const raw =
    process.env.SQUADS_VAULT_INDEX?.trim() ||
    process.env.NEXT_PUBLIC_SQUADS_VAULT_INDEX?.trim() ||
    "0";
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Invalid Squads vault index");
  }
  return value;
}

function getSquadsConfig():
  | { multisigPda: PublicKey; vaultPda: PublicKey; vaultIndex: number }
  | null {
  const multisigPda = getConfiguredSquadsMultisig();
  if (!multisigPda) return null;

  const vaultIndex = getConfiguredSquadsVaultIndex();
  const vaultPda = multisig.getVaultPda({ multisigPda, index: vaultIndex })[0];
  return { multisigPda, vaultPda, vaultIndex };
}

function describeSquadsPermissions(permissions: multisig.generated.Permissions): string[] {
  const result: string[] = [];
  if (multisig.types.Permissions.has(permissions, multisig.types.Permission.Initiate)) {
    result.push("initiate");
  }
  if (multisig.types.Permissions.has(permissions, multisig.types.Permission.Vote)) {
    result.push("vote");
  }
  if (multisig.types.Permissions.has(permissions, multisig.types.Permission.Execute)) {
    result.push("execute");
  }
  return result;
}

function memberHasConfiguredPermission(member: SquadsMemberSnapshot): boolean {
  const required = (process.env.ADMIN_SQUADS_REQUIRED_PERMISSION ?? "member")
    .trim()
    .toLowerCase();

  if (!required || required === "member") {
    return true;
  }

  if (required === "initiate" || required === "vote" || required === "execute") {
    return member.permissions.includes(required);
  }

  throw new Error("Invalid ADMIN_SQUADS_REQUIRED_PERMISSION");
}

async function fetchAdminAuthorityState(): Promise<AdminAuthorityState> {
  const endpoints = getRpcEndpoints();
  const squadsConfig = getSquadsConfig();
  let lastError: unknown;

  for (const endpoint of endpoints) {
    try {
      const connection = new Connection(endpoint, "confirmed");
      const program = getReadonlyProgram(connection);
      const accountApi = program.account as {
        pool: { fetch: (pubkey: ReturnType<typeof getPoolPda>) => Promise<PoolAccountLike> };
      };
      const poolState = await accountApi.pool.fetch(getPoolPda());
      const poolMasterWallet = poolState.masterWallet.toBase58();

      if (squadsConfig && poolMasterWallet === squadsConfig.vaultPda.toBase58()) {
        const squadsAccount = await multisig.accounts.Multisig.fromAccountAddress(
          connection,
          squadsConfig.multisigPda,
          "confirmed",
        );

        return {
          poolMasterWallet,
          governanceMode: "squads-v4",
          squadsMultisig: squadsConfig.multisigPda.toBase58(),
          squadsVault: squadsConfig.vaultPda.toBase58(),
          squadsVaultIndex: squadsConfig.vaultIndex,
          squadsMembers: squadsAccount.members.map((member) => ({
            wallet: member.key.toBase58(),
            permissions: describeSquadsPermissions(member.permissions),
          })),
        };
      }

      return {
        poolMasterWallet,
        governanceMode: "single-wallet",
        squadsMultisig: null,
        squadsVault: null,
        squadsVaultIndex: null,
        squadsMembers: [],
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function getAdminAuthorityState(): Promise<AdminAuthorityState> {
  if (
    adminAuthorityCache &&
    Date.now() - adminAuthorityCache.ts < ADMIN_AUTHORITY_TTL_MS
  ) {
    return adminAuthorityCache.state;
  }

  if (
    adminAuthorityFailureTs &&
    Date.now() - adminAuthorityFailureTs < ADMIN_AUTHORITY_FAILURE_BACKOFF_MS
  ) {
    if (adminAuthorityCache) {
      return adminAuthorityCache.state;
    }
    throw new Error("Admin authority lookup temporarily unavailable");
  }

  if (adminAuthorityPromise) {
    return adminAuthorityPromise;
  }

  adminAuthorityPromise = fetchAdminAuthorityState();

  try {
    const state = await adminAuthorityPromise;
    adminAuthorityFailureTs = 0;
    adminAuthorityCache = { state, ts: Date.now() };
    return state;
  } catch (error) {
    adminAuthorityFailureTs = Date.now();
    throw error;
  } finally {
    adminAuthorityPromise = null;
  }
}

export async function resolveAdminIdentity(wallet: string): Promise<AdminIdentity> {
  const state = await getAdminAuthorityState();
  const overrideWallets = withAdminOverride([]);
  if (overrideWallets.has(wallet)) {
    return {
      wallet,
      isAdmin: true,
      role: "override",
      governanceMode: state.governanceMode,
      poolMasterWallet: state.poolMasterWallet,
      squadsMultisig: state.squadsMultisig,
      squadsVault: state.squadsVault,
      squadsVaultIndex: state.squadsVaultIndex,
      squadsPermissions: [],
    };
  }

  if (state.governanceMode === "squads-v4") {
    const member = state.squadsMembers.find((entry) => entry.wallet === wallet);
    const isAdmin = !!member && memberHasConfiguredPermission(member);
    return {
      wallet,
      isAdmin,
      role: isAdmin ? "squads-member" : "none",
      governanceMode: state.governanceMode,
      poolMasterWallet: state.poolMasterWallet,
      squadsMultisig: state.squadsMultisig,
      squadsVault: state.squadsVault,
      squadsVaultIndex: state.squadsVaultIndex,
      squadsPermissions: member?.permissions ?? [],
    };
  }

  const isAdmin = wallet === state.poolMasterWallet;
  return {
    wallet,
    isAdmin,
    role: isAdmin ? "single-wallet" : "none",
    governanceMode: state.governanceMode,
    poolMasterWallet: state.poolMasterWallet,
    squadsMultisig: state.squadsMultisig,
    squadsVault: state.squadsVault,
    squadsVaultIndex: state.squadsVaultIndex,
    squadsPermissions: [],
  };
}

function decodeBase64(value: string) {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

async function verifySignature(
  wallet: string,
  message: string,
  signature: string
) {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(new PublicKey(wallet).toBytes()),
    { name: "Ed25519" },
    false,
    ["verify"]
  );

  return crypto.subtle.verify(
    "Ed25519",
    key,
    toArrayBuffer(decodeBase64(signature)),
    toArrayBuffer(new TextEncoder().encode(message))
  );
}

function hashBodyText(bodyText: string): string {
  return createHash("sha256").update(bodyText).digest("hex");
}

function validateSignedChallenge(args: {
  issuedAt: string | null;
  nonce: string | null;
  method: string;
  route: string;
  bodyHash: string;
}):
  | { ok: true; challenge: AdminAuthRequestChallenge }
  | { ok: false; error: string } {
  const { issuedAt, nonce, method, route, bodyHash } = args;

  if (!issuedAt || !nonce) {
    return { ok: false as const, error: "Missing admin authorization headers" };
  }

  const issuedAtMs = Date.parse(issuedAt);
  if (!Number.isFinite(issuedAtMs)) {
    return { ok: false as const, error: "Invalid authorization timestamp" };
  }

  const now = Date.now();
  if (issuedAtMs > now + CLOCK_SKEW_TOLERANCE_MS) {
    return {
      ok: false as const,
      error: "Authorization timestamp is in the future",
    };
  }
  if (now - issuedAtMs > ADMIN_AUTH_SIGNATURE_TTL_MS) {
    return { ok: false as const, error: "Authorization timestamp expired" };
  }

  return {
    ok: true as const,
    challenge: {
      method,
      route,
      bodyHash,
      issuedAt,
      nonce,
    },
  };
}

export async function authorizeGeoblockingUpdate(args: {
  wallet: string | null;
  signature: string | null;
  issuedAt: string | null;
  nonce: string | null;
  method: string;
  route: string;
  bodyText: string;
}) {
  const { wallet, signature, issuedAt, nonce, method, route, bodyText } = args;

  if (!wallet || !signature) {
    return { ok: false as const, error: "Missing admin authorization headers" };
  }

  const challenge = validateSignedChallenge({
    issuedAt,
    nonce,
    method,
    route,
    bodyHash: hashBodyText(bodyText),
  });
  if (!challenge.ok) {
    return challenge;
  }

  const message = buildAdminAccessMessage(challenge.challenge);

  try {
    const isValidSignature = await verifySignature(wallet, message, signature);
    if (!isValidSignature) {
      return { ok: false as const, error: "Invalid admin signature" };
    }

    const nonceResult = await consumeAdminAuthNonce(challenge.challenge);
    if (!nonceResult.ok) {
      return {
        ok: false as const,
        error: nonceResult.error ?? "Admin authorization nonce is invalid",
      };
    }

    const identity = await resolveAdminIdentity(wallet);
    if (!identity.isAdmin) {
      return { ok: false as const, error: "Connected wallet is not authorized" };
    }

    return { ok: true as const, identity };
  } catch (e: unknown) {
    console.error("[geoblocking-auth] Authorization verification failed:", e instanceof Error ? e.message : e);
    return { ok: false as const, error: "Failed to verify admin authorization" };
  }
}

export async function authorizeAdminAccess(args: {
  wallet: string | null;
  signature: string | null;
  issuedAt: string | null;
  nonce: string | null;
  method: string;
  route: string;
  bodyHash: string;
}) {
  const { wallet, signature, issuedAt, nonce, method, route, bodyHash } = args;

  if (!wallet || !signature) {
    return { ok: false as const, error: "Missing admin authorization headers" };
  }

  const challenge = validateSignedChallenge({
    issuedAt,
    nonce,
    method,
    route,
    bodyHash,
  });
  if (!challenge.ok) {
    return challenge;
  }

  try {
    const isValidSignature = await verifySignature(
      wallet,
      buildAdminAccessMessage(challenge.challenge),
      signature
    );
    if (!isValidSignature) {
      return { ok: false as const, error: "Invalid admin signature" };
    }

    const nonceResult = await consumeAdminAuthNonce(challenge.challenge);
    if (!nonceResult.ok) {
      return {
        ok: false as const,
        error: nonceResult.error ?? "Admin authorization nonce is invalid",
      };
    }

    const identity = await resolveAdminIdentity(wallet);
    return { ok: true as const, isAdmin: identity.isAdmin, identity };
  } catch (e: unknown) {
    console.error("[admin-auth] Access verification failed:", e instanceof Error ? e.message : e);
    return { ok: false as const, error: "Failed to verify admin authorization" };
  }
}
