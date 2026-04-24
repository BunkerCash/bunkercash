import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../geoblocking-auth", () => ({
  authorizeAdminAccess: vi.fn(),
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

const mockGetSnapshotByDate = vi.fn();
const mockGetSnapshotsByRange = vi.fn();
const mockGetLatestSnapshot = vi.fn();
const mockDisconnect = vi.fn();

vi.mock("@bunkercash/metrics-data", async () => {
  const actual = await vi.importActual<typeof import("@bunkercash/metrics-data")>(
    "@bunkercash/metrics-data",
  );
  return {
    ...actual,
    createMetricsClient: vi.fn(() => ({
      db: {},
      $disconnect: mockDisconnect,
    })),
    getSnapshotByDate: (...args: unknown[]) => mockGetSnapshotByDate(...args),
    getSnapshotsByRange: (...args: unknown[]) => mockGetSnapshotsByRange(...args),
    getLatestSnapshot: (...args: unknown[]) => mockGetLatestSnapshot(...args),
  };
});

import {
  fetchMetricsByDate,
  fetchMetricsByRange,
  fetchLatestMetrics,
} from "../metrics-history";
import { authorizeAdminAccess } from "../geoblocking-auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";

function makeAdminRequest() {
  return new Request("https://admin.test/metrics", {
    headers: {
      "x-admin-wallet": "TestWallet123",
      "x-admin-signature": "dGVzdHNpZw==",
      "x-admin-issued-at": new Date().toISOString(),
    },
  });
}

describe("metrics-history", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: { METRICS_DB: {} },
      ctx: {},
      cf: {},
    } as never);
  });

  describe("authentication enforcement", () => {
    it("rejects unauthenticated requests", async () => {
      vi.mocked(authorizeAdminAccess).mockResolvedValueOnce({
        ok: false,
        error: "Missing admin authorization headers",
      });

      await expect(
        fetchMetricsByDate(makeAdminRequest(), "2025-06-14"),
      ).rejects.toThrow("Missing admin authorization headers");
    });

    it("rejects non-admin wallets", async () => {
      vi.mocked(authorizeAdminAccess).mockResolvedValueOnce({
        ok: true,
        isAdmin: false,
      });

      await expect(
        fetchMetricsByDate(makeAdminRequest(), "2025-06-14"),
      ).rejects.toThrow("not authorized");
    });
  });

  describe("fetchMetricsByDate", () => {
    it("returns snapshot for valid date after auth", async () => {
      vi.mocked(authorizeAdminAccess).mockResolvedValueOnce({
        ok: true,
        isAdmin: true,
      });

      const snapshot = { id: 1, snapshotDate: "2025-06-14" };
      mockGetSnapshotByDate.mockResolvedValueOnce(snapshot);
      const result = await fetchMetricsByDate(makeAdminRequest(), "2025-06-14");
      expect(result).toEqual(snapshot);
    });

    it("checks auth before validating date (no auth bypass via invalid input)", async () => {
      vi.mocked(authorizeAdminAccess).mockResolvedValueOnce({
        ok: false,
        error: "Missing admin authorization headers",
      });

      await expect(
        fetchMetricsByDate(makeAdminRequest(), "bad-date"),
      ).rejects.toThrow("Missing admin authorization headers");

      expect(authorizeAdminAccess).toHaveBeenCalledOnce();
    });

    it("rejects invalid date format after successful auth", async () => {
      vi.mocked(authorizeAdminAccess).mockResolvedValueOnce({
        ok: true,
        isAdmin: true,
      });

      await expect(
        fetchMetricsByDate(makeAdminRequest(), "bad-date"),
      ).rejects.toThrow("Invalid date");
    });
  });

  describe("fetchMetricsByRange", () => {
    it("checks auth before validating range (no auth bypass via invalid range)", async () => {
      vi.mocked(authorizeAdminAccess).mockResolvedValueOnce({
        ok: false,
        error: "Missing admin authorization headers",
      });

      await expect(
        fetchMetricsByRange(makeAdminRequest(), {
          from: "2025-06-15",
          to: "2025-06-01",
        }),
      ).rejects.toThrow("Missing admin authorization headers");
    });

    it("rejects invalid range after auth", async () => {
      vi.mocked(authorizeAdminAccess).mockResolvedValueOnce({
        ok: true,
        isAdmin: true,
      });

      await expect(
        fetchMetricsByRange(makeAdminRequest(), {
          from: "2025-06-15",
          to: "2025-06-01",
        }),
      ).rejects.toThrow("must not be after");
    });

    it("rejects oversized range after auth", async () => {
      vi.mocked(authorizeAdminAccess).mockResolvedValueOnce({
        ok: true,
        isAdmin: true,
      });

      await expect(
        fetchMetricsByRange(makeAdminRequest(), {
          from: "2023-01-01",
          to: "2025-01-01",
        }),
      ).rejects.toThrow("exceeds maximum");
    });
  });

  describe("fetchLatestMetrics", () => {
    it("returns latest snapshot after auth", async () => {
      vi.mocked(authorizeAdminAccess).mockResolvedValueOnce({
        ok: true,
        isAdmin: true,
      });

      const snapshot = { id: 1, snapshotDate: "2025-06-14" };
      mockGetLatestSnapshot.mockResolvedValueOnce(snapshot);
      const result = await fetchLatestMetrics(makeAdminRequest());
      expect(result).toEqual(snapshot);
    });
  });
});
