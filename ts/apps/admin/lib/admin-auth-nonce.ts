import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import {
  EMPTY_BODY_SHA256,
  normalizeAdminAuthMethod,
  type AdminAuthRequestChallenge,
} from "./admin-auth-message";
import { PROGRAM_ID, getPoolPda } from "./program";
import { getConfiguredRpcCluster } from "./solana-env";

const ADMIN_AUTH_NONCE_BINDING = "ADMIN_AUTH_NONCES";
const ADMIN_AUTH_NONCE_URL = "https://admin-auth-nonce.internal";
const ADMIN_AUTH_CHALLENGE_RATE_LIMIT_MAX_REQUESTS = 20;
const ADMIN_AUTH_CHALLENGE_RATE_LIMIT_WINDOW_SECONDS = 60;
const NONCE_BYTES = 16;
const MAX_ROUTE_LENGTH = 512;
const HEX_64_PATTERN = /^[a-f0-9]{64}$/;

type AdminAuthNonceNamespace = DurableObjectNamespace;

export interface AdminAuthChallengeRequest {
  wallet: string;
  domain: string;
  method: string;
  route: string;
  bodyHash: string;
}

export interface AdminAuthNonceResult {
  ok: boolean;
  error?: string;
}

export class AdminAuthRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many admin challenge requests. Please wait and try again.");
    this.name = "AdminAuthRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function readHeaderString(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isProductionDeployEnv(): boolean {
  return process.env.NEXT_PUBLIC_DEPLOY_ENV?.trim() === "production";
}

export function getTrustedAdminChallengeIdentity(request: Request): string {
  const cfConnectingIp = readHeaderString(request.headers.get("cf-connecting-ip"));
  if (cfConnectingIp) {
    return `cf-ip:${cfConnectingIp}`;
  }

  if (isProductionDeployEnv()) {
    return "cf-ip:missing";
  }

  const xRealIp = readHeaderString(request.headers.get("x-real-ip"));
  if (xRealIp) {
    return `dev-x-real-ip:${xRealIp}`;
  }

  const forwardedFor = readHeaderString(request.headers.get("x-forwarded-for"));
  if (forwardedFor) {
    const [firstIp] = forwardedFor.split(",");
    const normalized = readHeaderString(firstIp ?? null);
    if (normalized) {
      return `dev-x-forwarded-for:${normalized}`;
    }
  }

  return "dev-ip:unknown";
}

export function isAdminAuthRateLimitError(
  error: unknown,
): error is AdminAuthRateLimitError {
  return error instanceof AdminAuthRateLimitError;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function createNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function normalizeRoute(route: string): string {
  const value = route.trim();
  if (!value.startsWith("/") || value.length > MAX_ROUTE_LENGTH) {
    throw new Error("Invalid admin authorization route");
  }

  if (value.startsWith("/api/admin-auth/")) {
    throw new Error("Invalid admin authorization route");
  }

  return value;
}

function normalizeBodyHash(bodyHash: string): string {
  const value = bodyHash.trim().toLowerCase();
  if (!HEX_64_PATTERN.test(value)) {
    throw new Error("Invalid admin authorization body hash");
  }

  return value;
}

function normalizeWallet(wallet: string): string {
  try {
    return new PublicKey(wallet.trim()).toBase58();
  } catch {
    throw new Error("Invalid admin authorization wallet");
  }
}

function normalizeDomain(domain: string): string {
  const value = domain.trim().toLowerCase();
  if (!value || value.length > 253 || value.includes("/")) {
    throw new Error("Invalid admin authorization domain");
  }
  return value;
}

export function getAdminAuthRoute(request: Request): string {
  const url = new URL(request.url);
  return `${url.pathname}${url.search}`;
}

export function getAdminAuthDomain(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host;
  return normalizeDomain(host);
}

export function getEmptyBodyHash(): string {
  return EMPTY_BODY_SHA256;
}

function getSquadsMultisigString(): string {
  return (
    process.env.SQUADS_MULTISIG_PUBKEY?.trim() ||
    process.env.NEXT_PUBLIC_SQUADS_MULTISIG_PUBKEY?.trim() ||
    "none"
  );
}

function getSquadsVaultString(multisigPda: string): string {
  if (multisigPda === "none") return "none";
  const rawIndex =
    process.env.SQUADS_VAULT_INDEX?.trim() ||
    process.env.NEXT_PUBLIC_SQUADS_VAULT_INDEX?.trim() ||
    "0";
  const vaultIndex = Number(rawIndex);
  if (!Number.isInteger(vaultIndex) || vaultIndex < 0) {
    throw new Error("Invalid Squads vault index");
  }
  return multisig
    .getVaultPda({ multisigPda: new PublicKey(multisigPda), index: vaultIndex })[0]
    .toBase58();
}

export function buildAdminAuthContext(input: {
  wallet: string;
  domain: string;
}): Pick<
  AdminAuthRequestChallenge,
  | "wallet"
  | "domain"
  | "env"
  | "cluster"
  | "programId"
  | "pool"
  | "squadsMultisig"
  | "squadsVault"
> {
  const squadsMultisig = getSquadsMultisigString();
  return {
    wallet: normalizeWallet(input.wallet),
    domain: normalizeDomain(input.domain),
    env: process.env.NEXT_PUBLIC_DEPLOY_ENV?.trim() || "dev",
    cluster: getConfiguredRpcCluster(),
    programId: PROGRAM_ID.toBase58(),
    pool: getPoolPda(PROGRAM_ID).toBase58(),
    squadsMultisig,
    squadsVault: getSquadsVaultString(squadsMultisig),
  };
}

export function normalizeChallengeRequest(
  input: AdminAuthChallengeRequest,
): AdminAuthChallengeRequest {
  return {
    wallet: normalizeWallet(input.wallet),
    domain: normalizeDomain(input.domain),
    method: normalizeAdminAuthMethod(input.method),
    route: normalizeRoute(input.route),
    bodyHash: normalizeBodyHash(input.bodyHash),
  };
}

async function getAdminAuthNonceNamespace(): Promise<AdminAuthNonceNamespace> {
  const { env } = await getCloudflareContext();
  const namespace = (env as Record<string, unknown>)[ADMIN_AUTH_NONCE_BINDING];

  if (!namespace) {
    throw new Error(
      `Durable Object binding "${ADMIN_AUTH_NONCE_BINDING}" not found in environment`,
    );
  }

  return namespace as AdminAuthNonceNamespace;
}

async function fetchNonceObject(
  objectName: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const namespace = await getAdminAuthNonceNamespace();
  const stub = namespace.get(namespace.idFromName(objectName));
  return stub.fetch(`${ADMIN_AUTH_NONCE_URL}${path}`, init);
}

async function hashIdentifier(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function readRetryAfterSeconds(response: Response): Promise<number> {
  const headerValue = response.headers.get("retry-after");
  const headerSeconds = headerValue ? Number(headerValue) : NaN;

  if (Number.isFinite(headerSeconds) && headerSeconds > 0) {
    return Math.ceil(headerSeconds);
  }

  const body = (await response.json().catch(() => null)) as
    | { retryAfterSeconds?: unknown }
    | null;
  const bodySeconds = Number(body?.retryAfterSeconds);

  return Number.isFinite(bodySeconds) && bodySeconds > 0
    ? Math.ceil(bodySeconds)
    : 1;
}

export async function enforceAdminChallengeRateLimit(options: {
  request: Request;
  wallet: string;
}) {
  const wallet = normalizeWallet(options.wallet);
  const identity = getTrustedAdminChallengeIdentity(options.request);
  const objectName = `challenge:${await hashIdentifier(`${wallet}:${identity}`)}`;
  const response = await fetchNonceObject(objectName, "/rate-limit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      maxRequests: ADMIN_AUTH_CHALLENGE_RATE_LIMIT_MAX_REQUESTS,
      windowSeconds: ADMIN_AUTH_CHALLENGE_RATE_LIMIT_WINDOW_SECONDS,
    }),
  });

  if (response.status === 429) {
    throw new AdminAuthRateLimitError(await readRetryAfterSeconds(response));
  }

  if (!response.ok) {
    throw new Error(`Admin challenge rate limit check failed (${response.status})`);
  }
}

export async function issueAdminAuthChallenge(
  request: AdminAuthChallengeRequest,
): Promise<AdminAuthRequestChallenge> {
  const normalized = normalizeChallengeRequest(request);
  const nonce = createNonce();
  const issuedAt = new Date().toISOString();
  const challenge: AdminAuthRequestChallenge = {
    ...buildAdminAuthContext({
      wallet: normalized.wallet,
      domain: normalized.domain,
    }),
    ...normalized,
    issuedAt,
    nonce,
  };

  const response = await fetchNonceObject(nonce, "/issue", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(challenge),
  });

  if (!response.ok) {
    throw new Error(`Failed to issue admin authorization nonce (${response.status})`);
  }

  return challenge;
}

export async function consumeAdminAuthNonce(
  challenge: AdminAuthRequestChallenge,
): Promise<AdminAuthNonceResult> {
  const normalized = normalizeChallengeRequest(challenge);
  const response = await fetchNonceObject(challenge.nonce, "/consume", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...buildAdminAuthContext({
        wallet: normalized.wallet,
        domain: normalized.domain,
      }),
      ...normalized,
      issuedAt: challenge.issuedAt,
      nonce: challenge.nonce,
    } satisfies AdminAuthRequestChallenge),
  });

  if (response.ok) {
    return { ok: true };
  }

  const body = (await response.json().catch(() => null)) as
    | { error?: unknown }
    | null;
  return {
    ok: false,
    error:
      typeof body?.error === "string"
        ? body.error
        : "Admin authorization nonce is invalid",
  };
}
