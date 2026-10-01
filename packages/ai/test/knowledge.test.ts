import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { embedTexts, mergeCompanyBrief, mockVector, EMBEDDING_DIMENSIONS } from "../src";

const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);

describe("knowledge AI in mock mode", () => {
  const saved = process.env.AI_MOCK;
  beforeEach(() => void (process.env.AI_MOCK = "1"));
  afterEach(() => void (process.env.AI_MOCK = saved));

  it("embeds deterministically, normalised, at the stored size", async () => {
    const [a, b] = await embedTexts(["Refunds within 14 days", "Refunds within 14 days"], "document");
    expect(a).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(a).toEqual(b);
    expect(Math.abs(cos(a!, a!) - 1)).toBeLessThan(1e-9);
  });

  it("puts texts that share words closer than unrelated ones", () => {
    const q = mockVector("how long do refunds take");
    expect(cos(q, mockVector("Refunds are paid within 14 days"))).toBeGreaterThan(cos(q, mockVector("Our office is in Amsterdam")));
  });

  it("merges a source into the brief and keeps other sources' facts", async () => {
    const first = await mergeCompanyBrief({ company: { name: "Acme" }, brief: null, source: { id: "s1", title: "Returns", kind: "file" }, passages: [{ heading: "Returns", content: "Returns within 30 days. Items must be unused." }] });
    const second = await mergeCompanyBrief({ company: { name: "Acme" }, brief: first, source: { id: "s2", title: "Shipping", kind: "file" }, passages: [{ heading: null, content: "We ship in two days." }] });
    expect(second.facts.map((f) => f.sourceId)).toEqual(["s1", "s2"]);
    expect(second.facts[0]!.text).toBe("Returns within 30 days.");
  });
});
