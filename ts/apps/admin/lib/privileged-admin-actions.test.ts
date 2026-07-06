import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const adminRoot = path.resolve(__dirname, "..");

const privilegedComponentPaths = [
  "components/fees-card.tsx",
  "components/mint-setup-card.tsx",
  "components/purchase-limits-card.tsx",
  "components/settlement-card.tsx",
  "components/master-operations-card.tsx",
];

function readAdminFile(relativePath: string): string {
  return readFileSync(path.join(adminRoot, relativePath), "utf8");
}

describe("privileged admin action execution", () => {
  it("does not pass the human wallet as the privileged admin/master authority", () => {
    for (const relativePath of privilegedComponentPaths) {
      const source = readAdminFile(relativePath);

      expect(source, relativePath).not.toMatch(
        /\badmin:\s*(?:wallet\.)?publicKey\b/,
      );
      expect(source, relativePath).not.toMatch(
        /\bmasterWallet:\s*(?:wallet\.)?publicKey\b/,
      );
    }
  });

  it("routes privileged component submissions through the shared admin transaction hook", () => {
    for (const relativePath of privilegedComponentPaths) {
      const source = readAdminFile(relativePath);

      expect(source, relativePath).toContain("useAdminTransaction");
      expect(source, relativePath).toContain("submit({");
    }
  });

  it("requires pre-sign review data for privileged component submissions", () => {
    for (const relativePath of privilegedComponentPaths) {
      const source = readAdminFile(relativePath);

      expect(source, relativePath).toContain("review:");
    }

    const hookSource = readAdminFile("hooks/useAdminTransaction.ts");
    expect(hookSource).toContain("requirePreSignReview");
    expect(hookSource).toContain("buildTransactionReview");
  });

  it("does not use Anchor rpc shortcuts for privileged actions", () => {
    for (const relativePath of privilegedComponentPaths) {
      const source = readAdminFile(relativePath);

      expect(source, relativePath).not.toContain(".rpc()");
    }
  });

  it("preserves settleClaims remaining accounts when building settlement instructions", () => {
    const source = readAdminFile("components/settlement-card.tsx");

    expect(source).toContain("settleClaims(Buffer.alloc(0))");
    expect(source).toContain(".remainingAccounts(remainingAccounts)");
    expect(source).toMatch(
      /remainingAccounts\.push\(\s*\{ pubkey: claimPubkey, isSigner: false, isWritable: true \},\s*\{ pubkey: userUsdcAta, isSigner: false, isWritable: true \},\s*\)/s,
    );
  });

  it("creates Squads vault transactions instead of direct submits in Squads mode", () => {
    const source = readAdminFile("hooks/useAdminTransaction.ts");

    expect(source).toContain("vaultTransactionCreate");
    expect(source).toContain("proposalCreate");
    expect(source).toContain('auth.governanceMode === "squads-v4"');
    expect(source).toContain("sendAndConfirmWalletTransaction");
  });

  it("does not auto-approve or auto-execute high-risk Squads proposals", () => {
    const source = readAdminFile("hooks/useAdminTransaction.ts");

    expect(source).not.toContain("proposalApprove");
    expect(source).not.toContain("vaultTransactionExecute");
    expect(source).toContain("autoApproved: false");
    expect(source).toContain("decodedInstructions");
    expect(source).toContain("validate-instructions");
  });
});
