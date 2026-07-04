import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/geoblocking-auth", () => ({
  authorizeAdminAccess: vi.fn(),
}));

vi.mock("@/lib/admin-auth-nonce", () => ({
  getAdminAuthRoute: (request: Request) => new URL(request.url).pathname,
  getEmptyBodyHash: () =>
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
}));

import { authorizeAdminAccess } from "@/lib/geoblocking-auth";
import { GET } from "./route";

function makeRequest() {
  return new Request("https://admin.test/api/admin/me", {
    headers: {
      "x-admin-wallet": "Wallet111111111111111111111111111111111111",
      "x-admin-signature": "dGVzdA==",
      "x-admin-issued-at": "2026-07-04T10:00:00.000Z",
      "x-admin-nonce": "0123456789abcdef0123456789abcdef",
    },
  });
}

describe("/api/admin/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the shared backend admin identity", async () => {
    vi.mocked(authorizeAdminAccess).mockResolvedValueOnce({
      ok: true,
      isAdmin: true,
      identity: {
        wallet: "Wallet111111111111111111111111111111111111",
        isAdmin: true,
        role: "squads-member",
        governanceMode: "squads-v4",
        poolMasterWallet: "Vault1111111111111111111111111111111111111",
        squadsMultisig: "Multisig111111111111111111111111111111111",
        squadsVault: "Vault1111111111111111111111111111111111111",
        squadsVaultIndex: 0,
        squadsPermissions: ["vote"],
      },
    });

    const response = await GET(makeRequest());

    await expect(response.json()).resolves.toEqual({
      wallet: "Wallet111111111111111111111111111111111111",
      isAdmin: true,
      role: "squads-member",
      governanceMode: "squads-v4",
      poolMasterWallet: "Vault1111111111111111111111111111111111111",
      squadsMultisig: "Multisig111111111111111111111111111111111",
      squadsVault: "Vault1111111111111111111111111111111111111",
      squadsVaultIndex: 0,
      squadsPermissions: ["vote"],
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(authorizeAdminAccess).toHaveBeenCalledWith({
      wallet: "Wallet111111111111111111111111111111111111",
      signature: "dGVzdA==",
      issuedAt: "2026-07-04T10:00:00.000Z",
      nonce: "0123456789abcdef0123456789abcdef",
      method: "GET",
      route: "/api/admin/me",
      bodyHash:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });
  });

  it("rejects failed authorization checks", async () => {
    vi.mocked(authorizeAdminAccess).mockResolvedValueOnce({
      ok: false,
      error: "Invalid admin signature",
    });

    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid admin signature",
    });
  });
});
