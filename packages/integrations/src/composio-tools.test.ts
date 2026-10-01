import { describe, expect, it } from "vitest";
import { definitionFromSnapshot, registerSnapshots, snapshotFromComposio, snapshotOf } from "./composio-tools";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { composioVersionOption, LEGACY_TOOLKIT_VERSION, withToolkitVersion } from "./providers";
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

describe("toolkit versions", () => {
  it("keeps the version a tool was listed with through the stored snapshot", () => {
    const snap = snapshotFromComposio({ ...invoice, version: "20260920_01" }, "xero");
    expect(snap.version).toBe("20260920_01");
    const def = definitionFromSnapshot(snap);
    expect(def.version).toBe("20260920_01");
    expect(snapshotOf(def)?.version).toBe("20260920_01");
    expect(snapshotFromComposio({ ...invoice, version: LEGACY_TOOLKIT_VERSION }, "xero").version).toBeUndefined();
  });

  it("always gives Composio a version to run a tool with", () => {
    // Pinned in the client: the client's version applies.
    expect(composioVersionOption("zendesk", "20260101_00")).toEqual({});
    // Listed with a version: run that version.
    expect(composioVersionOption("freshdesk", "20260920_01")).toEqual({ version: "20260920_01" });
    // Snapshots stored before versions were kept, or legacy listings: run the current version.
    expect(composioVersionOption("freshdesk", undefined)).toEqual({ dangerouslySkipVersionCheck: true });
    expect(composioVersionOption("freshdesk", LEGACY_TOOLKIT_VERSION)).toEqual({ dangerouslySkipVersionCheck: true });
  });
});

describe("every Composio execution has a toolkit version", () => {
  it("adds the skip flag only when no version is given", () => {
    expect(withToolkitVersion({ userId: "o", arguments: {} })).toEqual({ userId: "o", arguments: {}, dangerouslySkipVersionCheck: true });
    expect(withToolkitVersion({ userId: "o", version: "20260920_01" })).toEqual({ userId: "o", version: "20260920_01" });
  });

  it("creates the Composio client in one place only, so the guard covers every call", () => {
    const root = join(__dirname, "../../..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (["node_modules", ".next", ".turbo", "dist", ".git", ".trigger"].includes(name)) continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) && /new Composio\(/.test(readFileSync(path, "utf8"))) hits.push(path.slice(root.length + 1));
      }
    };
    for (const dir of ["apps", "packages"]) walk(join(root, dir));
    expect(hits).toEqual(["packages/integrations/src/providers.ts"]);
  });
});
