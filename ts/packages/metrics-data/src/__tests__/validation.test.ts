import { describe, it, expect } from "vitest";
import {
  isValidDateString,
  validateDateRange,
  previousUtcDate,
} from "../validation";

describe("isValidDateString", () => {
  it("accepts valid YYYY-MM-DD dates", () => {
    expect(isValidDateString("2025-01-01")).toBe(true);
    expect(isValidDateString("2025-12-31")).toBe(true);
    expect(isValidDateString("2024-02-29")).toBe(true);
  });

  it("rejects non-YYYY-MM-DD formats", () => {
    expect(isValidDateString("01-01-2025")).toBe(false);
    expect(isValidDateString("2025/01/01")).toBe(false);
    expect(isValidDateString("2025-1-1")).toBe(false);
    expect(isValidDateString("not-a-date")).toBe(false);
    expect(isValidDateString("")).toBe(false);
  });

  it("rejects invalid calendar dates", () => {
    expect(isValidDateString("2025-02-29")).toBe(false);
    expect(isValidDateString("2025-13-01")).toBe(false);
    expect(isValidDateString("2025-00-01")).toBe(false);
    expect(isValidDateString("2025-01-32")).toBe(false);
  });
});

describe("validateDateRange", () => {
  it("returns null for valid ranges", () => {
    expect(validateDateRange("2025-01-01", "2025-01-31")).toBeNull();
    expect(validateDateRange("2025-06-15", "2025-06-15")).toBeNull();
  });

  it("rejects invalid from date", () => {
    expect(validateDateRange("bad", "2025-01-01")).toContain("Invalid 'from'");
  });

  it("rejects invalid to date", () => {
    expect(validateDateRange("2025-01-01", "bad")).toContain("Invalid 'to'");
  });

  it("rejects inverted range", () => {
    const result = validateDateRange("2025-06-15", "2025-01-01");
    expect(result).toContain("must not be after");
  });

  it("rejects ranges exceeding 366 days", () => {
    const result = validateDateRange("2023-01-01", "2025-01-01");
    expect(result).toContain("exceeds maximum");
  });

  it("accepts exactly 366-day range", () => {
    expect(validateDateRange("2025-01-01", "2026-01-02")).toBeNull();
  });
});

describe("previousUtcDate", () => {
  it("returns the day before in UTC", () => {
    const now = new Date("2025-06-15T03:00:00Z");
    expect(previousUtcDate(now)).toBe("2025-06-14");
  });

  it("handles month boundaries", () => {
    const now = new Date("2025-03-01T00:10:00Z");
    expect(previousUtcDate(now)).toBe("2025-02-28");
  });

  it("handles year boundaries", () => {
    const now = new Date("2025-01-01T00:10:00Z");
    expect(previousUtcDate(now)).toBe("2024-12-31");
  });
});
