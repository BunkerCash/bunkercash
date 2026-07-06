import { describe, expect, it } from "vitest";
import { buildAdminAccessMessage } from "./admin-auth-message";

describe("admin auth message", () => {
  it("pins the v2 signed message layout", () => {
    expect(
      buildAdminAccessMessage({
        wallet: "Wallet1111111111111111111111111111111111",
        domain: "admin.bunkercash.com",
        env: "production",
        cluster: "mainnet-beta",
        programId: "Program111111111111111111111111111111111",
        pool: "Pool111111111111111111111111111111111111",
        squadsMultisig: "Squads111111111111111111111111111111111",
        squadsVault: "Vault1111111111111111111111111111111111",
        method: "get",
        route: "/api/admin/me",
        bodyHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        issuedAt: "2026-07-05T10:00:00.000Z",
        nonce: "0123456789abcdef0123456789abcdef",
      }),
    ).toBe(
      [
        "bunkercash-admin:v2",
        "wallet:Wallet1111111111111111111111111111111111",
        "domain:admin.bunkercash.com",
        "env:production",
        "cluster:mainnet-beta",
        "program-id:Program111111111111111111111111111111111",
        "pool:Pool111111111111111111111111111111111111",
        "squads-multisig:Squads111111111111111111111111111111111",
        "squads-vault:Vault1111111111111111111111111111111111",
        "method:GET",
        "route:/api/admin/me",
        "body-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "issued-at:2026-07-05T10:00:00.000Z",
        "nonce:0123456789abcdef0123456789abcdef",
      ].join("\n"),
    );
  });
});
