import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { consumeAdminSignature } from "./admin-signature-replay";

const idFromName = vi.fn(() => ({ id: "replay-object" }));
const stubFetch = vi.fn();
const get = vi.fn(() => ({ fetch: stubFetch }));

describe("consumeAdminSignature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: {
        ADMIN_SIGNATURE_REPLAY: {
          idFromName,
          get,
        },
      },
      ctx: {},
      cf: {},
    } as never);
  });

  it("uses the shared replay object and sends a hashed signature key", async () => {
    stubFetch.mockResolvedValueOnce(Response.json({ consumed: true }));

    await expect(
      consumeAdminSignature({
        wallet: "wallet",
        issuedAt: "2026-06-22T12:00:00.000Z",
        signature: "signature",
        ttlMs: 330_000,
      }),
    ).resolves.toBe(true);

    expect(idFromName).toHaveBeenCalledWith("admin-signature-replay-v1");
    expect(get).toHaveBeenCalledWith({ id: "replay-object" });

    const [, init] = stubFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      key: string;
      ttlMs: number;
    };
    expect(body.key).toMatch(/^[a-f0-9]{64}$/);
    expect(body.key).not.toContain("signature");
    expect(body.ttlMs).toBe(330_000);
  });

  it("returns false when the signature was already consumed", async () => {
    stubFetch.mockResolvedValueOnce(Response.json({ consumed: false }));

    await expect(
      consumeAdminSignature({
        wallet: "wallet",
        issuedAt: "2026-06-22T12:00:00.000Z",
        signature: "signature",
        ttlMs: 330_000,
      }),
    ).resolves.toBe(false);
  });

  it("fails closed when the Durable Object binding is missing", async () => {
    vi.mocked(getCloudflareContext).mockResolvedValueOnce({
      env: {},
      ctx: {},
      cf: {},
    } as never);

    await expect(
      consumeAdminSignature({
        wallet: "wallet",
        issuedAt: "2026-06-22T12:00:00.000Z",
        signature: "signature",
        ttlMs: 330_000,
      }),
    ).rejects.toThrow(
      'Durable Object binding "ADMIN_SIGNATURE_REPLAY" not found',
    );
  });
});
