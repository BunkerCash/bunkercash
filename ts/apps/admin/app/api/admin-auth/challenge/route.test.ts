import { beforeEach, describe, expect, it, vi } from "vitest";

const enforceAdminChallengeRateLimitMock = vi.fn();
const issueAdminAuthChallengeMock = vi.fn();

vi.mock("@/lib/admin-auth-nonce", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-auth-nonce")>();
  return {
    ...actual,
    enforceAdminChallengeRateLimit: (...args: unknown[]) =>
      enforceAdminChallengeRateLimitMock(...args),
    issueAdminAuthChallenge: (...args: unknown[]) =>
      issueAdminAuthChallengeMock(...args),
  };
});

const { AdminAuthRateLimitError } = await import("@/lib/admin-auth-nonce");
const { POST } = await import("./route");

function makeChallengeRequest() {
  return new Request("https://admin.bunkercash.com/api/admin-auth/challenge", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.42",
    },
    body: JSON.stringify({
      wallet: "11111111111111111111111111111112",
      method: "GET",
      route: "/api/admin/me",
      bodyHash: "0".repeat(64),
    }),
  });
}

describe("admin auth challenge route", () => {
  beforeEach(() => {
    enforceAdminChallengeRateLimitMock.mockReset();
    enforceAdminChallengeRateLimitMock.mockResolvedValue(undefined);
    issueAdminAuthChallengeMock.mockReset();
    issueAdminAuthChallengeMock.mockResolvedValue({
      ok: true,
      nonce: "0123456789abcdef0123456789abcdef",
    });
  });

  it("returns 429 when challenge rate limit is exceeded", async () => {
    enforceAdminChallengeRateLimitMock.mockRejectedValue(
      new AdminAuthRateLimitError(30),
    );

    const response = await POST(makeChallengeRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(await response.json()).toEqual({
      error: "Too many admin challenge requests. Please wait and try again.",
    });
    expect(issueAdminAuthChallengeMock).not.toHaveBeenCalled();
  });
});

