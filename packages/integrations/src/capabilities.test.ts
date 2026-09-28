import { describe, expect, it } from "vitest";
import { CAPABILITIES, capabilitiesOf } from "./capabilities";

describe("capabilitiesOf", () => {
  it("knows common tools", () => {
    expect(capabilitiesOf("zendesk")).toEqual(["helpdesk"]);
    expect(capabilitiesOf("stripe")).toEqual(["payments"]);
    expect(capabilitiesOf("outlook")).toEqual(["email", "calendar"]);
    expect(capabilitiesOf("google_drive")).toEqual(["documents"]);
  });

  it("falls back to the catalog category for other tools", () => {
    expect(capabilitiesOf("kustomer", "Customer support")).toEqual(["helpdesk"]);
    expect(capabilitiesOf("someapp", "Spreadsheets")).toEqual(["spreadsheet"]);
    expect(capabilitiesOf("someapp", null)).toEqual([]);
  });

  it("has unique keys and at least one tool each", () => {
    expect(new Set(CAPABILITIES.map((c) => c.key)).size).toBe(CAPABILITIES.length);
    for (const c of CAPABILITIES) expect(c.toolkits.length).toBeGreaterThan(0);
  });
});
