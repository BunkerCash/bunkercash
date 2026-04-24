import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MetricSnapshotInput } from "../types";

const mockRun = vi.fn();
const mockFirst = vi.fn();
const mockAll = vi.fn();
const mockBind = vi.fn();
const mockPrepare = vi.fn();

import {
  upsertSnapshot,
  getSnapshotByDate,
  getSnapshotsByRange,
  getLatestSnapshot,
} from "../repository";
import type { MetricsClient } from "../client";

function makeMockClient() {
  mockBind.mockImplementation(function () {
    return {
      run: mockRun,
      first: mockFirst,
      all: mockAll,
    };
  });
  mockPrepare.mockImplementation(() => ({
    bind: mockBind,
  }));

  return {
    db: {
      prepare: mockPrepare,
    },
    $disconnect: vi.fn(),
  } as unknown as MetricsClient;
}

describe("upsertSnapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a complete snapshot", async () => {
    const input: MetricSnapshotInput = {
      snapshotDate: "2025-06-14",
      navUsdc: 100000,
      pendingClaimsUsdc: 500,
      treasuryUsdc: 95000,
      totalSupply: 50000,
      tokenPrice: 1.9,
      pricePerToken: 1.9,
      openClaimsCount: 3,
      supportRequestCount: 1,
      holderCount: 42,
      adminWallet: "AdminPubkey123",
    };

    const row = {
      id: 1,
      ...input,
      collectedAt: new Date().toISOString(),
      isPartial: 0,
      errorsJson: null,
    };
    mockRun.mockResolvedValueOnce({});
    mockFirst.mockResolvedValueOnce(row);

    const result = await upsertSnapshot(makeMockClient(), input);
    expect(result.snapshotDate).toBe("2025-06-14");
    expect(result.isPartial).toBe(false);
    expect(mockRun).toHaveBeenCalledOnce();
  });

  it("stores partial snapshot with errors", async () => {
    const input: MetricSnapshotInput = {
      snapshotDate: "2025-06-14",
      navUsdc: 100000,
      isPartial: true,
      errorsJson: JSON.stringify([{ source: "holderCount", reason: "RPC timeout" }]),
    };

    const row = {
      id: 2,
      ...input,
      collectedAt: new Date().toISOString(),
      isPartial: 1,
    };
    mockRun.mockResolvedValueOnce({});
    mockFirst.mockResolvedValueOnce(row);

    const result = await upsertSnapshot(makeMockClient(), input);
    expect(result.isPartial).toBe(true);
    expect(result.errorsJson).toContain("holderCount");
  });

  it("rejects invalid snapshotDate", async () => {
    await expect(
      upsertSnapshot(makeMockClient(), { snapshotDate: "not-a-date" }),
    ).rejects.toThrow("Invalid snapshotDate");
  });

  it("overwrites an existing snapshot for the same date", async () => {
    const input: MetricSnapshotInput = { snapshotDate: "2025-06-14", navUsdc: 100 };
    const row = {
      id: 1,
      ...input,
      collectedAt: new Date().toISOString(),
      isPartial: 0,
      errorsJson: null,
    };
    mockRun.mockResolvedValue({});
    mockFirst.mockResolvedValue(row);

    await upsertSnapshot(makeMockClient(), input);
    await upsertSnapshot(makeMockClient(), input);

    expect(mockRun).toHaveBeenCalledTimes(2);
  });
});

describe("getSnapshotByDate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when no snapshot exists", async () => {
    mockFirst.mockResolvedValueOnce(null);
    const result = await getSnapshotByDate(makeMockClient(), "2025-06-14");
    expect(result).toBeNull();
  });

  it("rejects invalid date", async () => {
    await expect(
      getSnapshotByDate(makeMockClient(), "bad-date"),
    ).rejects.toThrow("Invalid date");
  });
});

describe("getSnapshotsByRange", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns rows ordered by date", async () => {
    const rows = [
      { id: 1, snapshotDate: "2025-06-13", collectedAt: new Date().toISOString(), isPartial: 0 },
      { id: 2, snapshotDate: "2025-06-14", collectedAt: new Date().toISOString(), isPartial: 0 },
    ];
    mockAll.mockResolvedValueOnce({ results: rows });

    const result = await getSnapshotsByRange(makeMockClient(), {
      from: "2025-06-13",
      to: "2025-06-14",
    });
    expect(result).toHaveLength(2);
    expect(mockBind).toHaveBeenCalledWith("2025-06-13", "2025-06-14", 400);
  });

  it("rejects invalid range", async () => {
    await expect(
      getSnapshotsByRange(makeMockClient(), { from: "2025-06-15", to: "2025-06-01" }),
    ).rejects.toThrow("must not be after");
  });

  it("rejects oversized range", async () => {
    await expect(
      getSnapshotsByRange(makeMockClient(), { from: "2023-01-01", to: "2025-01-01" }),
    ).rejects.toThrow("exceeds maximum");
  });
});

describe("getLatestSnapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when empty", async () => {
    mockPrepare.mockImplementationOnce(() => ({
      first: mockFirst,
    }));
    mockFirst.mockResolvedValueOnce(null);
    const result = await getLatestSnapshot(makeMockClient());
    expect(result).toBeNull();
  });
});
