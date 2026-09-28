import { describe, expect, it } from "vitest";
import { definitionFromSnapshot, registerSnapshots, snapshotFromComposio, snapshotOf } from "./composio-tools";
import { getTool, isHighRisk } from "./tools";

const invoice = {
  slug: "XERO_CREATE_INVOICE",
  name: "Create invoice",
  description: "Creates an invoice in Xero.",
  tags: ["Invoices", "createHint", "openWorldHint"],
  inputParameters: { type: "object", properties: { contact_id: { type: "string" }, amount: { type: "number" } }, required: ["contact_id"] },
};
const listContacts = {
  slug: "HUBSPOT_LIST_CONTACTS",
  name: "List contacts",
  description: "Lists contacts.",
  tags: ["Contacts", "readOnlyHint"],
  inputParameters: { type: "object", properties: { limit: { type: "integer" } } },
};

describe("Composio tools", () => {
  it("classifies read and write, and risk, from Composio's hints and the action", () => {
    const w = snapshotFromComposio(invoice, "xero");
    expect(w).toMatchObject({ key: "composio:XERO_CREATE_INVOICE", integration: "xero", access: "write", reversible: false, amountField: "amount" });
    expect(w.riskTags).toContain("financial");
    const r = snapshotFromComposio(listContacts, "hubspot");
    expect(r).toMatchObject({ access: "read", riskTags: [], reversible: true });
    expect(snapshotFromComposio({ ...listContacts, slug: "HUBSPOT_ARCHIVE_CONTACT", tags: ["destructiveHint"] }, "hubspot").riskTags).toContain("deletion");
  });
  it("checks required arguments and keeps the toolkit's schema for the model", () => {
    const def = definitionFromSnapshot(snapshotFromComposio(invoice, "xero"));
    expect(def.input.safeParse({ amount: 10 }).success).toBe(false);
    expect(def.input.safeParse({ contact_id: "c1", amount: 10 }).success).toBe(true);
    expect(def.jsonSchema).toEqual(invoice.inputParameters);
    expect(isHighRisk(def)).toBe(true);
  });
  it("registers stored definitions and round-trips them", () => {
    const snap = snapshotFromComposio(listContacts, "hubspot");
    registerSnapshots([snap, null]);
    expect(getTool(snap.key)?.access).toBe("read");
    expect(snapshotOf(getTool(snap.key))).toEqual(snap);
  });
  it("treats an unknown Composio tool as a write until its definition is loaded", () => {
    const def = getTool("composio:SALESFORCE_UPDATE_OPPORTUNITY");
    expect(def).toMatchObject({ access: "write", integration: "salesforce", source: "composio" });
    expect(snapshotOf(def)).toBeNull();
    expect(getTool("nope.tool")).toBeUndefined();
  });
});
