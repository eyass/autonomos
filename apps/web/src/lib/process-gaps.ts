import { qualityGaps } from "@autonomos/agents";

// What a process still needs before its numbers can be trusted, in words people can act
// on. Used as a checklist on the process and as a hint in the process list.
export function processGaps(p: {
  department_id: string | null;
  estimated_occurrences_per_month: number | string | null;
  estimated_minutes_per_occurrence: number | string | null;
  stepsCount?: number;
  systemsCount?: number;
  missing_information?: string[] | null;
}): string[] {
  const gaps: string[] = [];
  if (!p.estimated_occurrences_per_month) gaps.push("How often it happens");
  if (!p.estimated_minutes_per_occurrence) gaps.push("How long it takes each time");
  if (!p.department_id) gaps.push("Which team does it");
  if (p.stepsCount === 0) gaps.push("The steps");
  if (p.systemsCount === 0) gaps.push("The systems it uses");
  for (const m of p.missing_information ?? []) if (gaps.length < 6) gaps.push(m);
  return gaps;
}

// Estimates (hours, money, scores) are shown only for a process that is described well enough to
// base them on: the same floor that decides candidates and approval. Returns why they are held
// back, or null when they can be shown. Candidates are always held back.
export function estimateHeld(p: {
  status: string;
  confidence: number | string | null;
  estimated_occurrences_per_month: number | string | null;
  estimated_minutes_per_occurrence: number | string | null;
  stepsCount: number;
}): string | null {
  const gaps = qualityGaps({
    confidence: p.confidence === null ? null : Number(p.confidence),
    stepsCount: p.stepsCount,
    estimatedOccurrencesPerMonth: p.estimated_occurrences_per_month === null ? null : Number(p.estimated_occurrences_per_month),
    estimatedMinutesPerOccurrence: p.estimated_minutes_per_occurrence === null ? null : Number(p.estimated_minutes_per_occurrence),
  });
  if (gaps.length) return gaps[0]!;
  return p.status === "candidate" ? "Not described enough yet" : null;
}

// Supabase returns an embedded count as [{ count }].
export const embeddedCount = (v: unknown) => (Array.isArray(v) && v[0] && typeof (v[0] as { count?: unknown }).count === "number" ? (v[0] as { count: number }).count : 0);
