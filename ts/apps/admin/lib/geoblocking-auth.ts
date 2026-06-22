import { createHash } from "crypto";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import {
  ADMIN_AUTH_SIGNATURE_TTL_MS,
  buildAdminAccessMessage,
  type AdminAuthRequestChallenge,
} from "./admin-auth-message";
import { consumeAdminAuthNonce } from "./admin-auth-nonce";
import { getPoolPda, getReadonlyProgram } from "./program";
import { getConfiguredRpcCluster } from "./solana-env";

const CLOCK_SKEW_TOLERANCE_MS = 30 * 1000; // allow 30 s of clock skew for future timestamps
const ADMIN_WALLETS_TTL_MS = 60 * 1000;
const ADMIN_WALLETS_FAILURE_BACKOFF_MS = 15 * 1000;

interface PoolAccountLike {
  masterWallet: { toBase58: () => string };
}

let adminWalletsCache: { wallets: Set<string>; ts: number } | null = null;
let adminWalletsPromise: Promise<Set<string>> | null = null;
let adminWalletsFailureTs = 0;

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

export async function getAuthorizedAdminWallets(): Promise<Set<string>> {
  if (
    adminWalletsCache &&
    Date.now() - adminWalletsCache.ts < ADMIN_WALLETS_TTL_MS
  ) {
    return withAdminOverride(adminWalletsCache.wallets);
  }

  if (
    adminWalletsFailureTs &&
    Date.now() - adminWalletsFailureTs < ADMIN_WALLETS_FAILURE_BACKOFF_MS
  ) {
    if (adminWalletsCache) {
      return withAdminOverride(adminWalletsCache.wallets);
    }
    throw new Error("Admin wallet lookup temporarily unavailable");
  }

  if (adminWalletsPromise) {
    return withAdminOverride(await adminWalletsPromise);
  }

  adminWalletsPromise = (async () => {
    const endpoints = getRpcEndpoints();
    let lastError: unknown;

    for (const endpoint of endpoints) {
      try {
        const connection = new Connection(endpoint, "confirmed");
        const program = getReadonlyProgram(connection);
        const accountApi = program.account as {
          pool: { fetch: (pubkey: ReturnType<typeof getPoolPda>) => Promise<PoolAccountLike> };
        };
        const poolState = await accountApi.pool.fetch(getPoolPda());
        const wallets = new Set([poolState.masterWallet.toBase58()]);

        adminWalletsFailureTs = 0;
        adminWalletsCache = { wallets, ts: Date.now() };
        return wallets;
      } catch (error) {
        lastError = error;
      }
    }

    const override = process.env.ADMIN_OVERRIDE_WALLET?.trim();
    if (override) {
      const wallets = new Set(adminWalletsCache?.wallets ?? []);
      adminWalletsCache = { wallets, ts: Date.now() };
      return wallets;
    }

    throw lastError;
  })();

  try {
    return withAdminOverride(await adminWalletsPromise);
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

    const authorizedWallets = await getAuthorizedAdminWallets();
    if (!authorizedWallets.has(wallet)) {
      return { ok: false as const, error: "Connected wallet is not authorized" };
    }

    const nonceResult = await consumeAdminAuthNonce(challenge.challenge);
    if (!nonceResult.ok) {
      return {
        ok: false as const,
        error: nonceResult.error ?? "Admin authorization nonce is invalid",
      };
    }
  } catch (e: unknown) {
    console.error("[geoblocking-auth] Authorization verification failed:", e instanceof Error ? e.message : e);
    return { ok: false as const, error: "Failed to verify admin authorization" };
  }

  return { ok: true as const };
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

    const authorizedWallets = await getAuthorizedAdminWallets();
    const isAdmin = authorizedWallets.has(wallet);
    if (!isAdmin) {
      return { ok: true as const, isAdmin: false };
    }

    const nonceResult = await consumeAdminAuthNonce(challenge.challenge);
    if (!nonceResult.ok) {
      return {
        ok: false as const,
        error: nonceResult.error ?? "Admin authorization nonce is invalid",
      };
    }

    return { ok: true as const, isAdmin: true };
  } catch (e: unknown) {
    console.error("[admin-auth] Access verification failed:", e instanceof Error ? e.message : e);
    return { ok: false as const, error: "Failed to verify admin authorization" };
  }
}
