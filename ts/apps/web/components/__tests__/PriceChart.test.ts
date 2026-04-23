import { describe, expect, it } from "vitest";
import { formatPriceChartDate } from "../priceChartFormat";

describe("formatPriceChartDate", () => {
  it("formats a plain ISO date", () => {
    expect(formatPriceChartDate("2026-04-22")).toBe("04/22");
  });

  it("strips synthetic suffixes from fallback chart dates", () => {
    expect(formatPriceChartDate("2026-04-22 (open)")).toBe("04/22");
  });

  it("returns the original string when the input is not YYYY-MM-DD-like", () => {
    expect(formatPriceChartDate("open")).toBe("open");
  });
});
