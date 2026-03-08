import { describe, expect, it } from "vitest";
import {
  formatUsdc,
  metadataBytesToHex,
  parseMetadataHashInput,
  parseUsdcInput,
  shortPk,
} from "@/lib/master-operations";

describe("master-operations utilities", () => {
  it("formats USDC base units with two decimals", () => {
    expect(formatUsdc("1234567")).toBe("1.23");
    expect(formatUsdc(BigInt(42000000))).toBe("42.00");
  });

  it("parses valid USDC input into base units", () => {
    expect(parseUsdcInput("1.25")).toBe(BigInt(1250000));
    expect(parseUsdcInput("0")).toBeNull();
    expect(parseUsdcInput("-4")).toBeNull();
    expect(parseUsdcInput("abc")).toBeNull();
  });

  it("accepts a raw 32-byte hex metadata hash unchanged", async () => {
    const rawHex = "0x" + "ab".repeat(32);
    const parsed = await parseMetadataHashInput(rawHex);
    expect(metadataBytesToHex(parsed)).toBe("ab".repeat(32));
  });

  it("hashes reference strings with SHA-256", async () => {
    const parsed = await parseMetadataHashInput("loan-doc-123");
    expect(metadataBytesToHex(parsed)).toBe(
      "65e24a331ec464f085939a5ba6f19f902bff31760206767099a068d4224039fb"
    );
  });

  it("shortens long public keys for display", () => {
    expect(shortPk("123456789012")).toBe("123456789012");
    expect(shortPk("1234567890abcdefghijklmnop")).toBe("1234...mnop");
  });
});
