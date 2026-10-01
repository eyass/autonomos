import { CompanyBriefSchema, type CompanyBrief } from "@autonomos/schemas";
import { generateStructured, type UsageSink } from "../generate";
import { section } from "../prompt";

// The company brief: what AutonomOS knows about how a company works, merged one source at a
// time. Every fact keeps the id of the source it came from, and facts from other sources are
// kept unless this source states the opposite more recently.

export type BriefSource = { id: string; title: string; kind: string };

export async function mergeCompanyBrief(input: {
  company: { name: string; industry?: string | null };
  brief: CompanyBrief | null;
  source: BriefSource;
  passages: Array<{ heading: string | null; content: string }>;
  onUsage?: UsageSink;
}): Promise<CompanyBrief> {
  const material = input.passages
    .slice(0, 60)
    .map((p) => (p.heading ? `## ${p.heading}\n${p.content}` : p.content))
    .join("\n\n")
    .slice(0, 60_000);
  const { object } = await generateStructured({
    purpose: "company_brief",
    modelClass: "SMART_MODEL",
    schema: CompanyBriefSchema,
    schemaName: "company_brief",
    systemRules: [
      "You keep a company's brief: a factual summary of how it works, used by the AI agents that do its recurring work.",
      "Merge what the new source adds into the current brief. Keep every fact from other sources, with its sourceId, unless the new source clearly replaces it.",
      `Facts and policies taken from the new source get sourceId "${input.source.id}".`,
      "Policies are rules with their numbers (for example: Refunds within 14 days of delivery; items over €250 need a manager). Never invent numbers.",
      "Write plain sentences. No marketing language. Leave a field empty when the material does not support it.",
      "Never copy personal details about customers or staff into the brief.",
    ],
    sections: [
      section("company", input.company),
      section("current_brief", input.brief ?? {}),
      section("new_source", { title: input.source.title, kind: input.source.kind }),
      section("source_material", material, false),
    ],
    task: "Return the updated brief.",
    onUsage: input.onUsage,
    mock: () => mockMerge(input.brief, input.source, input.passages),
  });
  return object;
}

// Without a model: the first sentence of the first passages become facts, other facts stay.
function mockMerge(brief: CompanyBrief | null, source: BriefSource, passages: Array<{ heading: string | null; content: string }>): CompanyBrief {
  const base = CompanyBriefSchema.parse(brief ?? {});
  const facts = passages
    .slice(0, 5)
    .map((p) => (p.content.match(/^[^.!?\n]+[.!?]?/)?.[0] ?? p.content).trim().slice(0, 200))
    .filter(Boolean)
    .map((text) => ({ text, sourceId: source.id }));
  return { ...base, summary: base.summary || facts[0]?.text || "", facts: [...base.facts.filter((f) => f.sourceId !== source.id), ...facts] };
}
