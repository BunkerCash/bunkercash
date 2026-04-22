import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/solana-server", () => ({
  fetchPoolData: vi.fn(),
  fetchAllClaims: vi.fn(),
}));

vi.mock("@/lib/holder-count", () => ({
  fetchHolderCount: vi.fn(),
}));

vi.mock("@bunkercash/cloudflare-kv", () => ({
  kvList: vi.fn(),
}));

import { collectSnapshot } from "../metrics-collector";
import { fetchPoolData, fetchAllClaims } from "@/lib/solana-server";
import { fetchHolderCount } from "@/lib/holder-count";
import { kvList } from "@bunkercash/cloudflare-kv";

describe("collectSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(fetchPoolData).mockResolvedValue({
      tokenPrice: 1.5,
      totalSupplyRaw: 10000,
      navUsdcRaw: 15000,
      pendingClaimsUsdcRaw: 500,
      treasuryUsdcRaw: 14000,
      pricePerToken: 1.5,
      adminWallet: "AdminWallet123",
      ts: Date.now(),
    });

    vi.mocked(fetchAllClaims).mockResolvedValue({
      open: [],
      closed: [],
      totalRequestedUsdc: "0",
      openCount: 2,
      ts: Date.now(),
    });

    vi.mocked(fetchHolderCount).mockResolvedValue(42);

    vi.mocked(kvList).mockResolvedValue({
      keys: [],
      list_complete: true,
      cursor: "",
      cacheStatus: null,
    } as never);
  });

  it("assembles a complete snapshot from all sources", async () => {
    const result = await collectSnapshot("2025-06-14");

    expect(result.snapshotDate).toBe("2025-06-14");
    expect(result.navUsdc).toBe(15000);
    expect(result.pendingClaimsUsdc).toBe(500);
    expect(result.treasuryUsdc).toBe(14000);
    expect(result.totalSupply).toBe(10000);
    expect(result.tokenPrice).toBe(1.5);
    expect(result.pricePerToken).toBe(1.5);
    expect(result.adminWallet).toBe("AdminWallet123");
    expect(result.openClaimsCount).toBe(2);
    expect(result.holderCount).toBe(42);
    expect(result.supportRequestCount).toBe(0);
    expect(result.isPartial).toBeUndefined();
    expect(result.errorsJson).toBeUndefined();
  });

  it("returns partial snapshot when fetchPoolData fails", async () => {
    vi.mocked(fetchPoolData).mockRejectedValueOnce(new Error("RPC timeout"));

    const result = await collectSnapshot("2025-06-14");

    expect(result.isPartial).toBe(true);
    expect(result.navUsdc).toBeUndefined();
    expect(result.openClaimsCount).toBe(2);
    expect(result.holderCount).toBe(42);

    const errors = JSON.parse(result.errorsJson!);
    expect(errors).toHaveLength(1);
    expect(errors[0].source).toBe("fetchPoolData");
    expect(errors[0].reason).toContain("RPC timeout");
  });

  it("sanitizes URLs and long base64 tokens out of persisted errors", async () => {
    const sensitiveMessage =
      "Failed to connect to https://secret-rpc.internal.com:8899/v1?key=abc123 " +
      "with token ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop==";
    vi.mocked(fetchPoolData).mockRejectedValueOnce(new Error(sensitiveMessage));

    const result = await collectSnapshot("2025-06-14");

    const errors = JSON.parse(result.errorsJson!);
    expect(errors[0].reason).not.toContain("secret-rpc.internal.com");
    expect(errors[0].reason).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef");
    expect(errors[0].reason).toContain("[redacted]");
  });

  it("truncates excessively long error messages", async () => {
    const longMessage = "A".repeat(500);
    vi.mocked(fetchPoolData).mockRejectedValueOnce(new Error(longMessage));

    const result = await collectSnapshot("2025-06-14");

    const errors = JSON.parse(result.errorsJson!);
    expect(errors[0].reason.length).toBeLessThan(200);
  });

  it("returns partial snapshot when multiple sources fail", async () => {
    vi.mocked(fetchPoolData).mockRejectedValueOnce(new Error("RPC down"));
    vi.mocked(fetchAllClaims).mockRejectedValueOnce(new Error("Claims failed"));
    vi.mocked(fetchHolderCount).mockRejectedValueOnce(new Error("Holder count failed"));

    const result = await collectSnapshot("2025-06-14");

    expect(result.isPartial).toBe(true);
    expect(result.supportRequestCount).toBe(0);

    const errors = JSON.parse(result.errorsJson!);
    expect(errors).toHaveLength(3);
    const sources = errors.map((e: { source: string }) => e.source);
    expect(sources).toContain("fetchPoolData");
    expect(sources).toContain("fetchAllClaims");
    expect(sources).toContain("holderCount");
  });

  it("counts support requests for the correct UTC day", async () => {
    vi.mocked(kvList).mockResolvedValueOnce({
      keys: [
        { name: "support:request:2025-06-14T08:30:00.000Z:abc123" },
        { name: "support:request:2025-06-14T23:59:59.000Z:def456" },
        { name: "support:request:2025-06-15T00:00:01.000Z:ghi789" },
        { name: "support:request:2025-06-13T23:59:59.000Z:jkl012" },
      ],
      list_complete: true,
      cursor: "",
      cacheStatus: null,
    } as never);

    const result = await collectSnapshot("2025-06-14");
    expect(result.supportRequestCount).toBe(2);
  });
});
