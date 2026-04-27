import { beforeEach, describe, expect, it, vi } from "vitest";

const kvGetMock = vi.fn();
const kvListMock = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(() =>
    Promise.resolve({
      env: {
        GEOBLOCKING_KV: {
          get: (...args: unknown[]) => kvGetMock(...args),
          list: (...args: unknown[]) => kvListMock(...args),
        },
      },
    }),
  ),
}));

const { listSupportRequestsPage } = await import("./support-requests");

const requestKeys = [
  "support:request:2026-04-05T10:00:00.000Z:req-1",
  "support:request:2026-04-06T10:00:00.000Z:req-2",
  "support:request:2026-04-07T08:00:00.000Z:req-3",
  "support:request:2026-04-07T09:00:00.000Z:req-4",
  "support:request:2026-04-07T10:00:00.000Z:req-5",
];

function makeRequestRecord(key: string) {
  const suffix = key.slice("support:request:".length);
  const splitIndex = suffix.lastIndexOf(":");
  const createdAt = suffix.slice(0, splitIndex);
  const id = suffix.slice(splitIndex + 1);

  return {
    id,
    createdAt,
    fullName: `User ${id}`,
    email: `${id}@example.com`,
    phone: null,
    country: "Italy",
    subject: `Subject ${id}`,
    message: `Message ${id}`,
    source: "support-page" as const,
    pageUrl: "https://bunkercash.com/support",
  };
}

describe("listSupportRequestsPage", () => {
  beforeEach(() => {
    kvGetMock.mockReset();
    kvListMock.mockReset();

    kvListMock
      .mockResolvedValueOnce({
        keys: requestKeys.slice(0, 3).map((name) => ({ name })),
        list_complete: false,
        cursor: "page-2",
      })
      .mockResolvedValueOnce({
        keys: requestKeys.slice(3).map((name) => ({ name })),
        list_complete: true,
        cursor: undefined,
      });

    kvGetMock.mockImplementation(async (key: string) =>
      makeRequestRecord(key),
    );
  });

  it("returns the newest requests first with a cursor for more results", async () => {
    const page = await listSupportRequestsPage({ limit: 2 });

    expect(page.requests.map((request) => request.id)).toEqual(["req-5", "req-4"]);
    expect(page.nextCursor).toBe(
      "support:request:2026-04-07T09:00:00.000Z:req-4",
    );
    expect(kvGetMock).toHaveBeenCalledTimes(2);
  });

  it("returns the next slice when called with the previous page cursor", async () => {
    const page = await listSupportRequestsPage({
      limit: 2,
      cursor: "support:request:2026-04-07T09:00:00.000Z:req-4",
    });

    expect(page.requests.map((request) => request.id)).toEqual(["req-3", "req-2"]);
    expect(page.nextCursor).toBe(
      "support:request:2026-04-06T10:00:00.000Z:req-2",
    );
  });
});
