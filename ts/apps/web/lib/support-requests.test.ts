import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const kvPutMock = vi.fn();
const rateLimitFetchMock = vi.fn();
const rateLimitIdFromNameMock = vi.fn();
const rateLimitGetMock = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

vi.mock("@bunkercash/cloudflare-kv", () => ({
  kvPut: (...args: unknown[]) => kvPutMock(...args),
}));

const {
  enforceSupportRequestRateLimit,
  isSupportRateLimitError,
  parseSupportRequestInput,
} = await import("./support-requests");
const { SupportRateLimitDurableObject } = await import(
  "./support-rate-limit-durable-object"
);

const supportInput = parseSupportRequestInput({
  fullName: "Jane Doe",
  email: "jane@example.com",
  phone: "",
  country: "Italy",
  subject: "Need help",
  message: "Please review my blocked access case.",
  source: "support-page",
  pageUrl: "https://bunkercash.com/support",
});

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("https://bunkercash.com/api/support", { headers });
}

function makeDurableObjectId(name: string): DurableObjectId {
  return {
    name,
    toString: () => name,
    equals: (other) => other.toString() === name,
  };
}

function makeRateLimitStorage() {
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
    get: vi.fn(async (key: string) => values.get(key)),
    put: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
    delete: vi.fn(async (key: string) => values.delete(key)),
    transaction: vi.fn(async <T>(
      closure: (transaction: DurableObjectTransaction) => Promise<T>,
    ) => closure(transaction)),
  } as unknown as DurableObjectStorage;

  return {
    values,
    getAlarm: () => alarm,
    state: {
      storage,
    } as DurableObjectState,
  };
}

function makeRateLimitCheckRequest(maxRequests = 2, windowSeconds = 60) {
  return new Request("https://support-rate-limit.internal/check", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ maxRequests, windowSeconds }),
  });
}

describe("enforceSupportRequestRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T10:00:00.000Z"));
    kvPutMock.mockReset();
    kvPutMock.mockResolvedValue(undefined);
    rateLimitFetchMock.mockReset();
    rateLimitFetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    rateLimitIdFromNameMock.mockReset();
    rateLimitIdFromNameMock.mockImplementation(makeDurableObjectId);
    rateLimitGetMock.mockReset();
    rateLimitGetMock.mockReturnValue({
      fetch: (...args: unknown[]) => rateLimitFetchMock(...args),
    });
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: {
        SUPPORT_RATE_LIMIT: {
          idFromName: (...args: unknown[]) => rateLimitIdFromNameMock(...args),
          get: (...args: unknown[]) => rateLimitGetMock(...args),
        },
      },
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("checks both email and ip identities in Durable Objects", async () => {
    await expect(
      enforceSupportRequestRateLimit(
        makeRequest({ "cf-connecting-ip": "203.0.113.42" }),
        supportInput,
      ),
    ).resolves.toBeUndefined();

    expect(rateLimitIdFromNameMock).toHaveBeenCalledTimes(2);
    expect(rateLimitIdFromNameMock.mock.calls[0]?.[0]).toMatch(
      /^ip:[a-f0-9]{64}$/,
    );
    expect(rateLimitIdFromNameMock.mock.calls[1]?.[0]).toMatch(
      /^email:[a-f0-9]{64}$/,
    );
    expect(rateLimitFetchMock).toHaveBeenCalledTimes(2);
    expect(kvPutMock).not.toHaveBeenCalled();
  });

  it("rejects requests after the email window is exhausted", async () => {
    rateLimitFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ retryAfterSeconds: 5 * 60 }), {
        status: 429,
        headers: {
          "retry-after": (5 * 60).toString(),
        },
      }),
    );

    try {
      await enforceSupportRequestRateLimit(makeRequest(), supportInput);
      throw new Error("Expected support rate limiting to reject the request");
    } catch (error: unknown) {
      expect(isSupportRateLimitError(error)).toBe(true);
      expect(
        isSupportRateLimitError(error) ? error.retryAfterSeconds : 0,
      ).toBe(5 * 60);
    }

    expect(rateLimitFetchMock).toHaveBeenCalledTimes(1);
    expect(kvPutMock).not.toHaveBeenCalled();
  });

  it("does not increment the email counter when the ip check rejects first", async () => {
    rateLimitFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ retryAfterSeconds: 2 * 60 }), {
        status: 429,
        headers: {
          "retry-after": (2 * 60).toString(),
        },
      }),
    );

    try {
      await enforceSupportRequestRateLimit(
        makeRequest({ "cf-connecting-ip": "203.0.113.42" }),
        supportInput,
      );
      throw new Error("Expected support rate limiting to reject the request");
    } catch (error: unknown) {
      expect(isSupportRateLimitError(error)).toBe(true);
      expect(
        isSupportRateLimitError(error) ? error.retryAfterSeconds : 0,
      ).toBe(2 * 60);
    }

    expect(rateLimitFetchMock).toHaveBeenCalledTimes(1);
    expect(kvPutMock).not.toHaveBeenCalled();
  });
});

describe("SupportRateLimitDurableObject", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests until the fixed window is exhausted", async () => {
    const storage = makeRateLimitStorage();
    const durableObject = new SupportRateLimitDurableObject(storage.state, {});

    await expect(
      durableObject.fetch(makeRateLimitCheckRequest()),
    ).resolves.toMatchObject({ status: 204 });
    await expect(
      durableObject.fetch(makeRateLimitCheckRequest()),
    ).resolves.toMatchObject({ status: 204 });

    const rejected = await durableObject.fetch(makeRateLimitCheckRequest());

    expect(rejected.status).toBe(429);
    expect(rejected.headers.get("retry-after")).toBe("60");
    expect(await rejected.json()).toEqual({ retryAfterSeconds: 60 });
    expect(storage.values.get("window")).toEqual({
      count: 2,
      resetAt: Date.now() + 60 * 1000,
    });
    expect(storage.getAlarm()).toBe(Date.now() + 2 * 60 * 1000);
  });

  it("starts a new counter after the window resets", async () => {
    const storage = makeRateLimitStorage();
    const durableObject = new SupportRateLimitDurableObject(storage.state, {});

    await durableObject.fetch(makeRateLimitCheckRequest(1, 60));
    vi.setSystemTime(new Date("2026-04-07T10:01:01.000Z"));

    const response = await durableObject.fetch(makeRateLimitCheckRequest(1, 60));

    expect(response.status).toBe(204);
    expect(storage.values.get("window")).toEqual({
      count: 1,
      resetAt: Date.now() + 60 * 1000,
    });
  });
});
