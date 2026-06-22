import { DurableObject as CloudflareDurableObject } from "cloudflare:workers";
import {
  ADMIN_AUTH_SIGNATURE_TTL_MS,
  normalizeAdminAuthMethod,
  type AdminAuthRequestChallenge,
} from "./admin-auth-message";

const CHALLENGE_STORAGE_KEY = "challenge";
const CLEANUP_DELAY_MS = 60 * 1000;
const NONCE_PATTERN = /^[a-f0-9]{32}$/;
const BODY_HASH_PATTERN = /^[a-f0-9]{64}$/;

interface StoredAdminAuthChallenge extends AdminAuthRequestChallenge {
  expiresAt: number;
  consumedAt?: number;
}

function jsonResponse(value: unknown, init: ResponseInit): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");

  return new Response(JSON.stringify(value), {
    ...init,
    headers,
  });
}

function parseChallenge(value: unknown): AdminAuthRequestChallenge | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const input = value as Record<string, unknown>;
  if (
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
  if (
    method.length === 0 ||
    !input.route.startsWith("/") ||
    !BODY_HASH_PATTERN.test(bodyHash) ||
    !NONCE_PATTERN.test(nonce) ||
    !Number.isFinite(Date.parse(input.issuedAt))
  ) {
    return null;
  }

  return {
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

    return jsonResponse({ error: "Unknown nonce operation" }, { status: 404 });
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.delete(CHALLENGE_STORAGE_KEY);
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
