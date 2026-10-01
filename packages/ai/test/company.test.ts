import { describe, expect, it } from "vitest";
import { employeeBucket, mockProfile, type WebsiteEvidence } from "../src/tasks/company";

const site = (over: Partial<WebsiteEvidence> = {}): WebsiteEvidence => ({
  url: "https://acme-furniture.nl/",
  domain: "acme-furniture.nl",
  siteName: null,
  title: "Acme | Second-hand furniture marketplace",
  description: "Buy and sell used furniture from independent sellers.",
  language: "en",
  organization: null,
  pages: [{ url: "https://acme-furniture.nl/", kind: "home", title: "Acme", text: "Acme is a marketplace where buyers and sellers trade used furniture. We are 35 people in Amsterdam." }],
  detectedTools: [
    { key: "zendesk", name: "Zendesk", evidence: "" },
    { key: "stripe", name: "Stripe", evidence: "" },
  ],
  otherTechnology: [],
  ...over,
});

describe("mockProfile", () => {
  it("fills every field the onboarding form needs from website evidence", () => {
    const p = mockProfile(site());
    expect(p).toMatchObject({ name: "Acme", industry: "Marketplaces", employeeCount: "20–49", country: "Netherlands", currency: "EUR", hourlyCostEstimate: 45 });
    expect(p.summary).toContain("used furniture");
    expect(p.improvementAreas).toEqual(expect.arrayContaining(["Customer Support", "Finance", "Operations"]));
    expect(p.likelyProcesses.map((l) => l.title)).toContain("Refund request handling");
  });
  it("prefers structured data over guesses", () => {
    const p = mockProfile(site({ organization: { name: "Acme Furniture BV", country: "GB", employees: 300 } }));
    expect(p).toMatchObject({ name: "Acme Furniture BV", country: "United Kingdom", currency: "GBP", employeeCount: "250–499" });
  });
  it("stays honest when the site says little", () => {
    const p = mockProfile(site({ title: "Welcome", description: null, pages: [{ url: "https://x.io/", kind: "home", title: "", text: "Welcome." }], detectedTools: [], domain: "x.io" }));
    expect(p.industry).toBe("Other");
    expect(p.employeeCount).toBeNull();
    expect(p.confidence).toBeLessThan(0.5);
  });
});

describe("employeeBucket", () => {
  it.each([
    [5, "1–19"],
    [20, "20–49"],
    [99, "50–99"],
    [250, "250–499"],
    [1200, "500+"],
  ] as const)("%i -> %s", (n, b) => {
    expect(employeeBucket(n)).toBe(b);
  });
});
