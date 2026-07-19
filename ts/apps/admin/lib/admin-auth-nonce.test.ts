import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { EMPTY_BODY_SHA256 } from "./admin-auth-message";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

const { consumeAdminAuthNonce, issueAdminAuthChallenge } = await import(
  "./admin-auth-nonce"
);

describe("admin auth nonce local fallback", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: {} } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("issues and consumes a nonce when the local Durable Object binding is absent", async () => {
    const challenge = await issueAdminAuthChallenge({
      method: "GET",
      route: "/api/geoblocking",
      bodyHash: EMPTY_BODY_SHA256,
    });

    await expect(consumeAdminAuthNonce(challenge)).resolves.toEqual({
      ok: true,
    });
    await expect(consumeAdminAuthNonce(challenge)).resolves.toEqual({
      ok: false,
      error: "Admin authorization nonce was not issued",
    });
  });
});
