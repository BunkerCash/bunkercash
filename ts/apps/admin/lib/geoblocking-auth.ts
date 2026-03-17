import { createHash } from "crypto";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { buildAdminAccessMessage } from "./admin-auth-message";
import { getPoolPda, getReadonlyProgram } from "./program";

const SIGNATURE_TTL_MS = 5 * 60 * 1000;
const ADMIN_WALLETS_TTL_MS = 60 * 1000;
const ADMIN_WALLETS_FAILURE_BACKOFF_MS = 15 * 1000;

interface PoolAccountLike {
  masterWallet: { toBase58: () => string };
}

let adminWalletsCache: { wallets: Set<string>; ts: number } | null = null;
let adminWalletsPromise: Promise<Set<string>> | null = null;
let adminWalletsFailureTs = 0;

function getRpcEndpoint() {
  return process.env.NEXT_PUBLIC_RPC_ENDPOINT || clusterApiUrl("devnet");
}

export async function getAuthorizedAdminWallets(): Promise<Set<string>> {
  if (
    adminWalletsCache &&
    Date.now() - adminWalletsCache.ts < ADMIN_WALLETS_TTL_MS
  ) {
    return new Set(adminWalletsCache.wallets);
  }

  if (
    adminWalletsFailureTs &&
    Date.now() - adminWalletsFailureTs < ADMIN_WALLETS_FAILURE_BACKOFF_MS
  ) {
    throw new Error("Admin wallet lookup temporarily unavailable");
  }

  if (adminWalletsPromise) {
    return new Set(await adminWalletsPromise);
  }

  adminWalletsPromise = (async () => {
    const connection = new Connection(getRpcEndpoint(), "confirmed");
    const program = getReadonlyProgram(connection);
    const accountApi = program.account as {
      pool: { fetch: (pubkey: ReturnType<typeof getPoolPda>) => Promise<PoolAccountLike> };
    };
    const poolState = await accountApi.pool.fetch(getPoolPda());
    const wallets = new Set([poolState.masterWallet.toBase58()]);
    const override = process.env.ADMIN_OVERRIDE || process.env.NEXT_PUBLIC_ADMIN_OVERRIDE;

    if (override) {
      wallets.add(override);
    }

    adminWalletsFailureTs = 0;
    adminWalletsCache = { wallets, ts: Date.now() };
    return wallets;
  })();

  try {
    return new Set(await adminWalletsPromise);
  } catch (error) {
    adminWalletsFailureTs = Date.now();
    throw error;
  } finally {
    adminWalletsPromise = null;
  }
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

export function buildGeoblockingMessage(bodyText: string, issuedAt: string) {
  const bodyHash = createHash("sha256").update(bodyText).digest("hex");
  return `bunkercash-admin:geoblocking:update\n${issuedAt}\n${bodyHash}`;
}

export async function authorizeGeoblockingUpdate(args: {
  wallet: string | null;
  signature: string | null;
  issuedAt: string | null;
  bodyText: string;
}) {
  const { wallet, signature, issuedAt, bodyText } = args;

  if (!wallet || !signature || !issuedAt) {
    return { ok: false as const, error: "Missing admin authorization headers" };
  }

  const issuedAtMs = Date.parse(issuedAt);
  if (!Number.isFinite(issuedAtMs)) {
    return { ok: false as const, error: "Invalid authorization timestamp" };
  }

  if (Math.abs(Date.now() - issuedAtMs) > SIGNATURE_TTL_MS) {
    return { ok: false as const, error: "Authorization timestamp expired" };
  }

  const message = buildGeoblockingMessage(bodyText, issuedAt);

  try {
    const isValidSignature = await verifySignature(wallet, message, signature);
    if (!isValidSignature) {
      return { ok: false as const, error: "Invalid admin signature" };
    }

    const authorizedWallets = await getAuthorizedAdminWallets();
    if (!authorizedWallets.has(wallet)) {
      return { ok: false as const, error: "Connected wallet is not authorized" };
    }
  } catch {
    return { ok: false as const, error: "Failed to verify admin authorization" };
  }

  return { ok: true as const };
}

export async function authorizeAdminAccess(args: {
  wallet: string | null;
  signature: string | null;
  issuedAt: string | null;
}) {
  const { wallet, signature, issuedAt } = args;

  if (!wallet || !signature || !issuedAt) {
    return { ok: false as const, error: "Missing admin authorization headers" };
  }

  const issuedAtMs = Date.parse(issuedAt);
  if (!Number.isFinite(issuedAtMs)) {
    return { ok: false as const, error: "Invalid authorization timestamp" };
  }

  if (Math.abs(Date.now() - issuedAtMs) > SIGNATURE_TTL_MS) {
    return { ok: false as const, error: "Authorization timestamp expired" };
  }

  try {
    const isValidSignature = await verifySignature(
      wallet,
      buildAdminAccessMessage(issuedAt),
      signature
    );
    if (!isValidSignature) {
      return { ok: false as const, error: "Invalid admin signature" };
    }

    const authorizedWallets = await getAuthorizedAdminWallets();
    return { ok: true as const, isAdmin: authorizedWallets.has(wallet) };
  } catch {
    return { ok: false as const, error: "Failed to verify admin authorization" };
  }
}
