"use client";

import {
  buildAdminAccessMessage,
  EMPTY_BODY_SHA256,
  normalizeAdminAuthMethod,
  type AdminAuthRequestChallenge,
} from "./admin-auth-message";

type SignMessage = (message: Uint8Array) => Promise<Uint8Array>;

interface AdminAuthHeadersInput {
  publicKey: { toBase58(): string };
  signMessage: SignMessage;
  method: string;
  route: string;
  bodyHash?: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function requestAdminAuthChallenge(input: {
  method: string;
  route: string;
  bodyHash: string;
}): Promise<AdminAuthRequestChallenge> {
  const response = await fetch("/api/admin-auth/challenge", {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      method: normalizeAdminAuthMethod(input.method),
      route: input.route,
      bodyHash: input.bodyHash,
    }),
  });

  const data = (await response.json().catch(() => null)) as
    | (AdminAuthRequestChallenge & { error?: unknown })
    | null;

  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Failed to prepare admin authorization",
    );
  }

  if (
    !data ||
    typeof data.method !== "string" ||
    typeof data.route !== "string" ||
    typeof data.bodyHash !== "string" ||
    typeof data.issuedAt !== "string" ||
    typeof data.nonce !== "string"
  ) {
    throw new Error("Admin authorization challenge is malformed");
  }

  return data;
}

export async function buildAdminAuthHeaders(
  input: AdminAuthHeadersInput,
): Promise<Record<string, string>> {
  const challenge = await requestAdminAuthChallenge({
    method: input.method,
    route: input.route,
    bodyHash: input.bodyHash ?? EMPTY_BODY_SHA256,
  });
  const signatureBytes = await input.signMessage(
    new TextEncoder().encode(buildAdminAccessMessage(challenge)),
  );

  return {
    "x-admin-wallet": input.publicKey.toBase58(),
    "x-admin-issued-at": challenge.issuedAt,
    "x-admin-nonce": challenge.nonce,
    "x-admin-signature": bytesToBase64(signatureBytes),
  };
}
