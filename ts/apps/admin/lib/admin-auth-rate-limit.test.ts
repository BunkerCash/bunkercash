import { afterEach, describe, expect, it } from "vitest";
import { getTrustedAdminChallengeIdentity } from "./admin-auth-nonce";

function makeRequest(headers: Record<string, string>) {
  return new Request("https://admin.bunkercash.com/api/admin-auth/challenge", {
    headers,
  });
}

describe("admin challenge trusted identity", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_DEPLOY_ENV;
  });

  it("uses Cloudflare connecting IP in production", () => {
    process.env.NEXT_PUBLIC_DEPLOY_ENV = "production";

    expect(
      getTrustedAdminChallengeIdentity(
        makeRequest({
          "cf-connecting-ip": "203.0.113.42",
          "x-forwarded-for": "198.51.100.10",
          "x-real-ip": "198.51.100.11",
        }),
      ),
    ).toBe("cf-ip:203.0.113.42");
  });

  it("does not trust spoofable forwarded headers in production", () => {
    process.env.NEXT_PUBLIC_DEPLOY_ENV = "production";

    const first = getTrustedAdminChallengeIdentity(
      makeRequest({
        "x-forwarded-for": "198.51.100.10",
        "x-real-ip": "198.51.100.11",
      }),
    );
    const second = getTrustedAdminChallengeIdentity(
      makeRequest({
        "x-forwarded-for": "203.0.113.10",
        "x-real-ip": "203.0.113.11",
      }),
    );

    expect(first).toBe("cf-ip:missing");
    expect(second).toBe(first);
  });

  it("allows forwarded-header fallback outside production", () => {
    process.env.NEXT_PUBLIC_DEPLOY_ENV = "dev";

    expect(
      getTrustedAdminChallengeIdentity(
        makeRequest({ "x-forwarded-for": "198.51.100.10, 10.0.0.1" }),
      ),
    ).toBe("dev-x-forwarded-for:198.51.100.10");
  });
});

