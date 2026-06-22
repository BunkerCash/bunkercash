import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  EMPTY_BODY_SHA256,
  normalizeAdminAuthMethod,
  type AdminAuthRequestChallenge,
} from "./admin-auth-message";

const ADMIN_AUTH_NONCE_BINDING = "ADMIN_AUTH_NONCES";
const ADMIN_AUTH_NONCE_URL = "https://admin-auth-nonce.internal";
const NONCE_BYTES = 16;
const MAX_ROUTE_LENGTH = 512;
const HEX_64_PATTERN = /^[a-f0-9]{64}$/;

type AdminAuthNonceNamespace = DurableObjectNamespace;

export interface AdminAuthChallengeRequest {
  method: string;
  route: string;
  bodyHash: string;
}

export interface AdminAuthNonceResult {
  ok: boolean;
  error?: string;
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

export function getAdminAuthRoute(request: Request): string {
  const url = new URL(request.url);
  return `${url.pathname}${url.search}`;
}

export function getEmptyBodyHash(): string {
  return EMPTY_BODY_SHA256;
}

export function normalizeChallengeRequest(
  input: AdminAuthChallengeRequest,
): AdminAuthChallengeRequest {
  return {
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
  nonce: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const namespace = await getAdminAuthNonceNamespace();
  const stub = namespace.get(namespace.idFromName(nonce));
  return stub.fetch(`${ADMIN_AUTH_NONCE_URL}${path}`, init);
}

export async function issueAdminAuthChallenge(
  request: AdminAuthChallengeRequest,
): Promise<AdminAuthRequestChallenge> {
  const normalized = normalizeChallengeRequest(request);
  const nonce = createNonce();
  const issuedAt = new Date().toISOString();
  const challenge: AdminAuthRequestChallenge = {
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
