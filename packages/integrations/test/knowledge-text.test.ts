import { describe, expect, it } from "vitest";
import { redactPersonal, splitPassages } from "../src/knowledge-text";

describe("redactPersonal", () => {
  it("removes emails, phone numbers and IBANs and keeps line breaks", () => {
    const out = redactPersonal("Contact anna@shop.nl\nor call +31 6 1234 5678.\nIBAN NL91ABNA0417164300");
    expect(out).toBe("Contact [email]\nor call [phone].\nIBAN [iban]");
  });
  it("leaves prices, dates and order numbers alone", () => {
    expect(redactPersonal("Refunds within 14 days, up to €250. Order 2026-10-01.")).toBe("Refunds within 14 days, up to €250. Order 2026-10-01.");
  });
});

describe("splitPassages", () => {
  it("returns nothing for empty text and one passage for short text", () => {
    expect(splitPassages("  ")).toEqual([]);
    expect(splitPassages("Refunds are possible within 14 days.")).toEqual([{ heading: null, content: "Refunds are possible within 14 days." }]);
  });

  it("splits by heading and carries the heading into each passage", () => {
    const text = "# Returns\nYou can return items within 14 days.\n# Shipping\nWe ship within two working days.";
    expect(splitPassages(text)).toEqual([
      { heading: "Returns", content: "You can return items within 14 days." },
      { heading: "Shipping", content: "We ship within two working days." },
    ]);
  });

  it("keeps long sections under the size limit with overlap", () => {
    const sentence = "Our refund policy covers damaged items and late deliveries in detail. ";
    const text = `# Refunds\n${sentence.repeat(80)}`;
    const passages = splitPassages(text, { max: 1500, overlap: 150 });
    expect(passages.length).toBeGreaterThan(3);
    for (const p of passages) {
      expect(p.heading).toBe("Refunds");
      expect(p.content.length).toBeLessThanOrEqual(1500);
    }
    // The end of one passage reappears at the start of the next.
    const tail = passages[0]!.content.slice(-60);
    expect(passages[1]!.content.includes(tail.slice(-40))).toBe(true);
  });
});
