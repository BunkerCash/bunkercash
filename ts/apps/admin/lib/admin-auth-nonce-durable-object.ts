import { DurableObject as CloudflareDurableObject } from "cloudflare:workers";
import {
  ADMIN_AUTH_SIGNATURE_TTL_MS,
  normalizeAdminAuthMethod,
  type AdminAuthRequestChallenge,
} from "./admin-auth-message";

const CHALLENGE_STORAGE_KEY = "challenge";
const RATE_LIMIT_STORAGE_KEY = "rate-limit-window";
const CLEANUP_DELAY_MS = 60 * 1000;
const NONCE_PATTERN = /^[a-f0-9]{32}$/;
const BODY_HASH_PATTERN = /^[a-f0-9]{64}$/;
const PUBLIC_KEY_OR_NONE_PATTERN = /^(none|[1-9A-HJ-NP-Za-km-z]{32,44})$/;
const MAX_RATE_LIMIT_REQUESTS = 1000;
const MAX_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

interface StoredAdminAuthChallenge extends AdminAuthRequestChallenge {
  expiresAt: number;
  consumedAt?: number;
}

interface RateLimitCheckRequest {
  maxRequests: number;
  windowSeconds: number;
}

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

function jsonResponse(value: unknown, init: ResponseInit): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");

  return new Response(JSON.stringify(value), {
    ...init,
    headers,
  });
}

function readPositiveInteger(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  return value >= 1 && value <= max ? value : null;
}

function parseRateLimitCheckRequest(value: unknown): RateLimitCheckRequest | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const maxRequests = readPositiveInteger(
    payload.maxRequests,
    MAX_RATE_LIMIT_REQUESTS,
  );
  const windowSeconds = readPositiveInteger(
    payload.windowSeconds,
    MAX_RATE_LIMIT_WINDOW_SECONDS,
  );

  return maxRequests && windowSeconds ? { maxRequests, windowSeconds } : null;
}

function isRateLimitRecord(value: unknown): value is RateLimitRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.count === "number" &&
    Number.isInteger(record.count) &&
    record.count >= 0 &&
    typeof record.resetAt === "number" &&
    Number.isFinite(record.resetAt)
  );
}

function parseChallenge(value: unknown): AdminAuthRequestChallenge | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const input = value as Record<string, unknown>;
  if (
    typeof input.wallet !== "string" ||
    typeof input.domain !== "string" ||
    typeof input.env !== "string" ||
    typeof input.cluster !== "string" ||
    typeof input.programId !== "string" ||
    typeof input.pool !== "string" ||
    typeof input.squadsMultisig !== "string" ||
    typeof input.squadsVault !== "string" ||
    typeof input.method !== "string" ||
    typeof input.route !== "string" ||
    typeof input.bodyHash !== "string" ||
    typeof input.issuedAt !== "string" ||
    typeof input.nonce !== "string"
  ) {
    return null;
  }

  const method = normalizeAdminAuthMethod(input.method);
  const bodyHash = input.bodyHash.toLowerCase();
  const nonce = input.nonce.toLowerCase();
  const wallet = input.wallet.trim();
  const domain = input.domain.trim().toLowerCase();
  const env = input.env.trim();
  const cluster = input.cluster.trim();
  const programId = input.programId.trim();
  const pool = input.pool.trim();
  const squadsMultisig = input.squadsMultisig.trim();
  const squadsVault = input.squadsVault.trim();
  if (
    !PUBLIC_KEY_OR_NONE_PATTERN.test(wallet) ||
    wallet === "none" ||
    domain.length === 0 ||
    domain.length > 253 ||
    domain.includes("/") ||
    env.length === 0 ||
    cluster.length === 0 ||
    !PUBLIC_KEY_OR_NONE_PATTERN.test(programId) ||
    programId === "none" ||
    !PUBLIC_KEY_OR_NONE_PATTERN.test(pool) ||
    pool === "none" ||
    !PUBLIC_KEY_OR_NONE_PATTERN.test(squadsMultisig) ||
    !PUBLIC_KEY_OR_NONE_PATTERN.test(squadsVault) ||
    method.length === 0 ||
    !input.route.startsWith("/") ||
    !BODY_HASH_PATTERN.test(bodyHash) ||
    !NONCE_PATTERN.test(nonce) ||
    !Number.isFinite(Date.parse(input.issuedAt))
  ) {
    return null;
  }

  return {
    wallet,
    domain,
    env,
    cluster,
    programId,
    pool,
    squadsMultisig,
    squadsVault,
    method,
    route: input.route,
    bodyHash,
    issuedAt: input.issuedAt,
    nonce,
  };
}

function isStoredChallenge(value: unknown): value is StoredAdminAuthChallenge {
  if (!value || typeof value !== "object") {
    return false;
  }

  const input = value as Record<string, unknown>;
  return (
    parseChallenge(input) !== null &&
    typeof input.expiresAt === "number" &&
    Number.isFinite(input.expiresAt) &&
    (input.consumedAt === undefined ||
      (typeof input.consumedAt === "number" &&
        Number.isFinite(input.consumedAt)))
  );
}

function challengeMatches(
  stored: StoredAdminAuthChallenge,
  incoming: AdminAuthRequestChallenge,
): boolean {
  return (
    stored.method === incoming.method &&
    stored.wallet === incoming.wallet &&
    stored.domain === incoming.domain &&
    stored.env === incoming.env &&
    stored.cluster === incoming.cluster &&
    stored.programId === incoming.programId &&
    stored.pool === incoming.pool &&
    stored.squadsMultisig === incoming.squadsMultisig &&
    stored.squadsVault === incoming.squadsVault &&
    stored.route === incoming.route &&
    stored.bodyHash === incoming.bodyHash &&
    stored.issuedAt === incoming.issuedAt &&
    stored.nonce === incoming.nonce
  );
}

export class AdminAuthNonceDurableObject extends CloudflareDurableObject {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response(null, {
        status: 405,
        headers: {
          Allow: "POST",
        },
      });
    }

    const path = new URL(request.url).pathname;
    const payload = await request.json().catch(() => null);

    if (path === "/issue") {
      return this.issue(payload);
    }

    if (path === "/consume") {
      return this.consume(payload);
    }

    if (path === "/rate-limit") {
      return this.rateLimit(payload);
    }

    return jsonResponse({ error: "Unknown nonce operation" }, { status: 404 });
  }

  async alarm(): Promise<void> {
    await Promise.all([
      this.ctx.storage.delete(CHALLENGE_STORAGE_KEY),
      this.ctx.storage.delete(RATE_LIMIT_STORAGE_KEY),
    ]);
  }

  private async rateLimit(payload: unknown): Promise<Response> {
    const limit = parseRateLimitCheckRequest(payload);
    if (!limit) {
      return jsonResponse({ error: "Invalid rate limit request" }, { status: 400 });
    }

    const now = Date.now();
    const result = await this.ctx.storage.transaction((transaction) =>
      this.checkRateLimitWindow(transaction, limit, now),
    );

    if (!result.allowed) {
      const retryAfterSeconds = Math.max(1, result.retryAfterSeconds ?? 1);
      return jsonResponse(
        { retryAfterSeconds },
        {
          status: 429,
          headers: {
            "retry-after": retryAfterSeconds.toString(),
          },
        },
      );
    }

    return new Response(null, { status: 204 });
  }

  private async checkRateLimitWindow(
    transaction: DurableObjectTransaction,
    limit: RateLimitCheckRequest,
    now: number,
  ): Promise<RateLimitResult> {
    const existingValue = await transaction.get<unknown>(RATE_LIMIT_STORAGE_KEY);
    const existing = isRateLimitRecord(existingValue) ? existingValue : null;

    if (existing && existing.resetAt > now) {
      if (existing.count >= limit.maxRequests) {
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
        };
      }

      await transaction.put(RATE_LIMIT_STORAGE_KEY, {
        count: existing.count + 1,
        resetAt: existing.resetAt,
      } satisfies RateLimitRecord);
      await transaction.setAlarm(existing.resetAt + CLEANUP_DELAY_MS);
      return { allowed: true };
    }

    const resetAt = now + limit.windowSeconds * 1000;
    await transaction.put(RATE_LIMIT_STORAGE_KEY, {
      count: 1,
      resetAt,
    } satisfies RateLimitRecord);
    await transaction.setAlarm(resetAt + CLEANUP_DELAY_MS);
    return { allowed: true };
  }

  private async issue(payload: unknown): Promise<Response> {
    const challenge = parseChallenge(payload);
    if (!challenge) {
      return jsonResponse({ error: "Invalid nonce challenge" }, { status: 400 });
    }

    const issuedAtMs = Date.parse(challenge.issuedAt);
    const expiresAt = issuedAtMs + ADMIN_AUTH_SIGNATURE_TTL_MS;
    const result = await this.ctx.storage.transaction(async (transaction) => {
      const existing = await transaction.get<unknown>(CHALLENGE_STORAGE_KEY);
      if (isStoredChallenge(existing) && !existing.consumedAt) {
        return { status: 409, error: "Nonce challenge already exists" };
      }

      await transaction.put(CHALLENGE_STORAGE_KEY, {
        ...challenge,
        expiresAt,
      } satisfies StoredAdminAuthChallenge);
      await transaction.setAlarm(expiresAt + CLEANUP_DELAY_MS);

      return { status: 204 };
    });

    if (result.status !== 204) {
      return jsonResponse({ error: result.error }, { status: result.status });
    }

    return new Response(null, { status: 204 });
  }

  private async consume(payload: unknown): Promise<Response> {
    const challenge = parseChallenge(payload);
    if (!challenge) {
      return jsonResponse({ error: "Invalid nonce challenge" }, { status: 400 });
    }

    const result = await this.ctx.storage.transaction(async (transaction) => {
      const existing = await transaction.get<unknown>(CHALLENGE_STORAGE_KEY);
      if (!isStoredChallenge(existing)) {
        return { status: 404, error: "Admin authorization nonce was not issued" };
      }

      if (existing.consumedAt) {
        return { status: 409, error: "Admin authorization nonce was already used" };
      }

      if (Date.now() > existing.expiresAt) {
        return { status: 410, error: "Admin authorization nonce expired" };
      }

      if (!challengeMatches(existing, challenge)) {
        return { status: 400, error: "Admin authorization nonce mismatch" };
      }

      await transaction.put(CHALLENGE_STORAGE_KEY, {
        ...existing,
        consumedAt: Date.now(),
      } satisfies StoredAdminAuthChallenge);
      await transaction.setAlarm(Date.now() + CLEANUP_DELAY_MS);

      return { status: 204 };
    });

    if (result.status === 204) {
      return new Response(null, { status: 204 });
    }

    return jsonResponse({ error: result.error }, { status: result.status });
  }
}
