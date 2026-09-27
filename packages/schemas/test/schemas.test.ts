import { describe, expect, it } from "vitest";
import { CURRENCIES, fromUsd, USD_REFERENCE_RATES } from "../src";

describe("AI spend conversion", () => {
  it("has a reference rate for every workspace currency", () => {
    for (const c of CURRENCIES) expect(USD_REFERENCE_RATES[c]).toBeGreaterThan(0);
  });
  it("converts from US dollars and leaves USD as is", () => {
    expect(fromUsd(10, "USD")).toBe(10);
    expect(fromUsd(10, "EUR")).toBeCloseTo(8.6);
    expect(fromUsd(0, "SEK")).toBe(0);
  });
});

describe("generated titles", () => {
  it("keeps short titles and cuts long ones at a word", async () => {
    const { tidyTitle } = await import("../src");
    expect(tidyTitle("refund request handling.")).toBe("Refund request handling");
    const long = tidyTitle("Monitoring of paid search campaigns across Google Ads and Microsoft Ads accounts every single week");
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith(" ")).toBe(false);
    expect("Monitoring of paid search campaigns across Google Ads and Microsoft Ads accounts every single week".startsWith(long)).toBe(true);
  });
});
