import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const kvGetMock = vi.fn();
const kvPutMock = vi.fn();

vi.mock("@bunkercash/cloudflare-kv", () => ({
  kvGet: (...args: unknown[]) => kvGetMock(...args),
  kvPut: (...args: unknown[]) => kvPutMock(...args),
}));

const {
  enforceSupportRequestRateLimit,
  isSupportRateLimitError,
  parseSupportRequestInput,
} = await import("./support-requests");

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

describe("enforceSupportRequestRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T10:00:00.000Z"));
    kvGetMock.mockReset();
    kvPutMock.mockReset();
    kvPutMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates both email and ip counters for a fresh request", async () => {
    kvGetMock.mockResolvedValue(null);

    await expect(
      enforceSupportRequestRateLimit(
        makeRequest({ "cf-connecting-ip": "203.0.113.42" }),
        supportInput,
      ),
    ).resolves.toBeUndefined();

    expect(kvGetMock).toHaveBeenCalledTimes(2);
    expect(kvPutMock).toHaveBeenCalledTimes(2);
  });

  it("rejects requests after the email window is exhausted", async () => {
    kvGetMock.mockResolvedValue({
      count: 5,
      resetAt: Date.now() + 5 * 60 * 1000,
    });

    try {
      await enforceSupportRequestRateLimit(makeRequest(), supportInput);
      throw new Error("Expected support rate limiting to reject the request");
    } catch (error: unknown) {
      expect(isSupportRateLimitError(error)).toBe(true);
      expect(
        isSupportRateLimitError(error) ? error.retryAfterSeconds : 0,
      ).toBe(5 * 60);
    }

    expect(kvPutMock).not.toHaveBeenCalled();
  });

  it("does not increment the email counter when the ip check rejects first", async () => {
    kvGetMock
      .mockResolvedValueOnce({
        count: 3,
        resetAt: Date.now() + 2 * 60 * 1000,
      })
      .mockResolvedValueOnce(null);

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

    expect(kvGetMock).toHaveBeenCalledTimes(1);
    expect(kvPutMock).not.toHaveBeenCalled();
  });
});
