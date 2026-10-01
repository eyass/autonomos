import { readFileSync } from "node:fs";
import { INDUSTRIES, PlaybookDraftSchema } from "@autonomos/schemas";
import { describe, expect, it } from "vitest";
import { isCapability } from "./capabilities";
import { LIBRARY_MIGRATION, PLAYBOOK_LIBRARY, libraryRow, librarySql } from "./playbook-library";

describe("playbook library", () => {
  it("gives every industry at least three playbooks to try", () => {
    for (const industry of INDUSTRIES) {
      const n = PLAYBOOK_LIBRARY.filter((p) => p.industries.includes(industry)).length;
      expect(n, industry).toBeGreaterThanOrEqual(3);
    }
  });
  it("uses known industries and capabilities, unique slugs, and valid playbooks", () => {
    expect(new Set(PLAYBOOK_LIBRARY.map((p) => p.slug)).size).toBe(PLAYBOOK_LIBRARY.length);
    for (const p of PLAYBOOK_LIBRARY) {
      for (const i of p.industries) expect(INDUSTRIES, p.slug).toContain(i);
      for (const s of p.steps) if (s.capability) expect(isCapability(s.capability), `${p.slug}: ${s.capability}`).toBe(true);
      const r = libraryRow(p);
      const parsed = PlaybookDraftSchema.safeParse({ ...r, estimatedMinutesPerOccurrence: r.estimated_minutes_per_occurrence });
      expect(parsed.success, `${p.slug}: ${parsed.error?.message}`).toBe(true);
      expect(p.steps.length).toBeGreaterThanOrEqual(3);
    }
  });
  it("matches the committed migration", () => {
    const committed = readFileSync(new URL(`../../../supabase/migrations/${LIBRARY_MIGRATION}`, import.meta.url), "utf8");
    expect(committed, "regenerate with pnpm --filter @autonomos/integrations playbooks:sql").toBe(librarySql());
  });
});
