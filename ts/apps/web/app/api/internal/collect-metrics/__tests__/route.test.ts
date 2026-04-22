import { describe, it, expect } from "vitest";

import { POST } from "../route";

describe("POST /api/_internal/collect-metrics", () => {
  const AUTH_HEADER = "Bearer anything";

  function makeRequest(authHeader?: string) {
    const headers: HeadersInit = authHeader
      ? { authorization: authHeader }
      : {};
    return new Request("https://web.test/api/_internal/collect-metrics", {
      method: "POST",
      headers,
    });
  }

  it("returns 404 with no authorization header", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });

  it("returns 404 with any authorization header", async () => {
    const res = await POST(makeRequest("Bearer wrong-secret"));
    expect(res.status).toBe(404);
  });

  it("returns a generic not found payload", async () => {
    const res = await POST(makeRequest(AUTH_HEADER));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });
});
