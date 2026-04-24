import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

vi.mock("@bunkercash/metrics-data", () => ({
  createMetricsClient: vi.fn(),
  getSnapshotByDate: vi.fn(),
  upsertSnapshot: vi.fn(),
  previousUtcDate: vi.fn(() => "2025-06-14"),
}));

vi.mock("../metrics-collector", () => ({
  collectSnapshot: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  createMetricsClient,
  getSnapshotByDate,
  upsertSnapshot,
} from "@bunkercash/metrics-data";
import { collectSnapshot } from "../metrics-collector";
import { runDailyCollection } from "../metrics-cron";

describe("runDailyCollection", () => {
  const disconnect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: { METRICS_DB: {} as D1Database },
    } as never);
    vi.mocked(createMetricsClient).mockReturnValue({
      db: {} as D1Database,
      $disconnect: disconnect,
    } as never);
    vi.mocked(collectSnapshot).mockResolvedValue({
      snapshotDate: "2025-06-14",
      isPartial: true,
    } as never);
  });

  it("refreshes partial snapshots instead of skipping them", async () => {
    vi.mocked(getSnapshotByDate).mockResolvedValue({
      snapshotDate: "2025-06-14",
      isPartial: true,
    } as never);
    vi.mocked(upsertSnapshot).mockResolvedValue({
      snapshotDate: "2025-06-14",
      isPartial: false,
    } as never);

    const result = await runDailyCollection();

    expect(getSnapshotByDate).toHaveBeenCalledOnce();
    expect(collectSnapshot).toHaveBeenCalledOnce();
    expect(upsertSnapshot).toHaveBeenCalledOnce();
    expect(result.isPartial).toBe(false);
  });

  it("skips when a complete snapshot already exists", async () => {
    vi.mocked(getSnapshotByDate).mockResolvedValue({
      snapshotDate: "2025-06-14",
      isPartial: false,
    } as never);

    const result = await runDailyCollection();

    expect(collectSnapshot).not.toHaveBeenCalled();
    expect(upsertSnapshot).not.toHaveBeenCalled();
    expect(result.isPartial).toBe(false);
  });
});
