import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

const mockGetSnapshotsByRange = vi.fn();
const mockDisconnect = vi.fn();

vi.mock("@bunkercash/metrics-data", async () => {
  const actual = await vi.importActual<typeof import("@bunkercash/metrics-data")>(
    "@bunkercash/metrics-data",
  );

  return {
    ...actual,
    createMetricsClient: vi.fn(() => ({
      $disconnect: mockDisconnect,
    })),
    getSnapshotsByRange: (...args: unknown[]) => mockGetSnapshotsByRange(...args),
  };
});

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { GET } from "../route";

describe("GET /api/price-history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: { METRICS_DB: {} },
      ctx: {},
      cf: {},
    } as never);
  });

  it("returns only D1-backed rows with non-null prices", async () => {
    mockGetSnapshotsByRange.mockResolvedValueOnce([
      { snapshotDate: "2025-06-12", pricePerToken: 1.11 },
      { snapshotDate: "2025-06-13", pricePerToken: null },
      { snapshotDate: "2025-06-14", pricePerToken: 1.23 },
    ]);

    const res = await GET(
      new Request("https://web.test/api/price-history?days=3"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([
      { date: "2025-06-12", price: 1.11 },
      { date: "2025-06-14", price: 1.23 },
    ]);
  });

  it("returns empty data when the D1 binding is missing", async () => {
    vi.mocked(getCloudflareContext).mockResolvedValueOnce({
      env: {},
      ctx: {},
      cf: {},
    } as never);

    const res = await GET(
      new Request("https://web.test/api/price-history?days=30"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
    expect(mockGetSnapshotsByRange).not.toHaveBeenCalled();
  });

  it("clamps the requested range before querying D1", async () => {
    mockGetSnapshotsByRange.mockResolvedValueOnce([]);

    const res = await GET(
      new Request("https://web.test/api/price-history?days=999"),
    );

    expect(res.status).toBe(200);
    expect(mockGetSnapshotsByRange).toHaveBeenCalledOnce();
    expect(mockGetSnapshotsByRange.mock.calls[0]?.[1]).toEqual({
      from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });
});
