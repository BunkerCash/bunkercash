import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_AUTH_SIGNATURE_TTL_MS, EMPTY_BODY_SHA256 } from "./admin-auth-message";
import { AdminAuthNonceDurableObject } from "./admin-auth-nonce-durable-object";

const challenge = {
  wallet: "11111111111111111111111111111112",
  domain: "admin.bunkercash.com",
  env: "production",
  cluster: "mainnet-beta",
  programId: "11111111111111111111111111111112",
  pool: "11111111111111111111111111111112",
  squadsMultisig: "none",
  squadsVault: "none",
  method: "GET",
  route: "/api/support-requests?limit=25",
  bodyHash: EMPTY_BODY_SHA256,
  issuedAt: "2026-04-07T10:00:00.000Z",
  nonce: "0123456789abcdef0123456789abcdef",
};

function makeDurableObjectStorage() {
  const values = new Map<string, unknown>();
  let alarm: number | Date | null = null;

  const transaction = {
    get: vi.fn(async (key: string) => values.get(key)),
    put: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
    delete: vi.fn(async (key: string) => values.delete(key)),
    setAlarm: vi.fn(async (scheduledTime: number | Date) => {
      alarm = scheduledTime;
    }),
  } as unknown as DurableObjectTransaction;

  const storage = {
    delete: vi.fn(async (key: string) => values.delete(key)),
    transaction: vi.fn(async <T>(
      closure: (transaction: DurableObjectTransaction) => Promise<T>,
    ) => closure(transaction)),
  } as unknown as DurableObjectStorage;

  return {
    values,
    getAlarm: () => alarm,
    state: { storage } as DurableObjectState,
  };
}

function makeRequest(path: string, payload = challenge) {
  return new Request(`https://admin-auth-nonce.internal${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function makeRateLimitRequest(maxRequests = 2, windowSeconds = 60) {
  return new Request("https://admin-auth-nonce.internal/rate-limit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ maxRequests, windowSeconds }),
  });
}

describe("AdminAuthNonceDurableObject", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("consumes an issued nonce exactly once", async () => {
    const storage = makeDurableObjectStorage();
    const durableObject = new AdminAuthNonceDurableObject(storage.state, {});

    const issueResponse = await durableObject.fetch(makeRequest("/issue"));
    const consumeResponse = await durableObject.fetch(makeRequest("/consume"));
    const replayResponse = await durableObject.fetch(makeRequest("/consume"));

    expect(issueResponse.status).toBe(204);
    expect(consumeResponse.status).toBe(204);
    expect(replayResponse.status).toBe(409);
    expect(await replayResponse.json()).toEqual({
      error: "Admin authorization nonce was already used",
    });
    expect(storage.values.get("challenge")).toMatchObject({
      ...challenge,
      consumedAt: Date.now(),
    });
  });

  it("rejects route/body mismatches without consuming the nonce", async () => {
    const storage = makeDurableObjectStorage();
    const durableObject = new AdminAuthNonceDurableObject(storage.state, {});

    await durableObject.fetch(makeRequest("/issue"));
    const response = await durableObject.fetch(
      makeRequest("/consume", {
        ...challenge,
        route: "/api/geoblocking",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Admin authorization nonce mismatch",
    });
    expect(storage.values.get("challenge")).toEqual({
      ...challenge,
      expiresAt: Date.parse(challenge.issuedAt) + ADMIN_AUTH_SIGNATURE_TTL_MS,
    });
  });

  it("rejects wallet/program context mismatches without consuming the nonce", async () => {
    const storage = makeDurableObjectStorage();
    const durableObject = new AdminAuthNonceDurableObject(storage.state, {});

    await durableObject.fetch(makeRequest("/issue"));
    const response = await durableObject.fetch(
      makeRequest("/consume", {
        ...challenge,
        wallet: "11111111111111111111111111111113",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Admin authorization nonce mismatch",
    });
    expect(storage.values.get("challenge")).toEqual({
      ...challenge,
      expiresAt: Date.parse(challenge.issuedAt) + ADMIN_AUTH_SIGNATURE_TTL_MS,
    });
  });

  it("rejects expired nonces", async () => {
    const storage = makeDurableObjectStorage();
    const durableObject = new AdminAuthNonceDurableObject(storage.state, {});

    await durableObject.fetch(makeRequest("/issue"));
    vi.setSystemTime(new Date(Date.parse(challenge.issuedAt) + ADMIN_AUTH_SIGNATURE_TTL_MS + 1));

    const response = await durableObject.fetch(makeRequest("/consume"));

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: "Admin authorization nonce expired",
    });
  });

  it("rejects malformed nonce payloads", async () => {
    const storage = makeDurableObjectStorage();
    const durableObject = new AdminAuthNonceDurableObject(storage.state, {});

    const response = await durableObject.fetch(
      makeRequest("/issue", {
        ...challenge,
        nonce: "not-a-nonce",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid nonce challenge",
    });
  });

  it("rate-limits challenge checks in a fixed window", async () => {
    const storage = makeDurableObjectStorage();
    const durableObject = new AdminAuthNonceDurableObject(storage.state, {});

    await expect(
      durableObject.fetch(makeRateLimitRequest()),
    ).resolves.toMatchObject({ status: 204 });
    await expect(
      durableObject.fetch(makeRateLimitRequest()),
    ).resolves.toMatchObject({ status: 204 });

    const rejected = await durableObject.fetch(makeRateLimitRequest());

    expect(rejected.status).toBe(429);
    expect(rejected.headers.get("retry-after")).toBe("60");
    expect(await rejected.json()).toEqual({ retryAfterSeconds: 60 });
    expect(storage.values.get("rate-limit-window")).toEqual({
      count: 2,
      resetAt: Date.now() + 60 * 1000,
    });
  });
});
