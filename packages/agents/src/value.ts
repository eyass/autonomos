import { AUTONOMY_COEFFICIENTS, type AutonomyLevel } from "@autonomos/schemas";

// What a suggested process is worth, so discovery only puts forward work that truly adds
// value: enough human time an agent could take over, or work that protects money, customers
// or growth, backed by evidence rather than a guess. Pure, so every entry point agrees.

export type ValueCandidate = {
  title: string;
  description: string;
  estimatedOccurrencesPerMonth?: number | null;
  estimatedMinutesPerOccurrence?: number | null;
  currentAutonomyLevel: number;
  potentialAutonomyLevel: number;
  confidence: number;
  kind?: "recurring_work" | "improvement";
  evidence?: Array<{ source: string; detail: string }>;
};

export type ProcessValue = {
  // Human time the work takes today, and the share of it an agent could take over.
  hoursPerMonth: number;
  agentHoursPerMonth: number;
  // That share in money, at the hourly cost.
  perMonth: number;
  // Protects or grows money, customers or revenue (worth doing even when it is quick).
  highImpact: boolean;
  // Backed by counts or records in the data, not only inferred from the company profile.
  evidenced: boolean;
  score: number;
  // Why it is worth it, in one line for the person reviewing it.
  why: string;
};

const IMPACT =
  /refund|payment|invoice|revenue|churn|fraud|chargeback|dispute|overdue|collection|renewal|upsell|lead|conversion|abandon|complaint|safety|compliance|scam|spend|roas|cpa|margin|pricing|backlog|sla|escalat/i;
// Routine chores that are rarely worth an agent unless they are large.
const CHORE =
  /newsletter|inbox (clean|zero|tidy)|file (organi[sz]|sort)|folder|calendar (management|tidy)|meeting (scheduling|booking)|note[- ]taking|password|desk booking|lunch|birthday|out of office/i;

const lift = (current: number, potential: number) =>
  Math.max(0, (AUTONOMY_COEFFICIENTS[Math.min(5, Math.max(1, potential)) as AutonomyLevel] ?? 0) - (AUTONOMY_COEFFICIENTS[Math.min(5, Math.max(1, current)) as AutonomyLevel] ?? 0));

export function processValue(p: ValueCandidate, hourlyCost: number): ProcessValue {
  const hoursPerMonth = ((p.estimatedOccurrencesPerMonth ?? 0) * (p.estimatedMinutesPerOccurrence ?? 0)) / 60;
  const agentHoursPerMonth = hoursPerMonth * lift(p.currentAutonomyLevel, p.potentialAutonomyLevel);
  const text = `${p.title} ${p.description}`;
  const highImpact = IMPACT.test(text);
  const evidenced = (p.evidence ?? []).some((e) => /\d/.test(e.detail) && !/company profile|industry|likely|typical/i.test(`${e.source} ${e.detail}`)) && p.confidence > 0.45;
  const perMonth = agentHoursPerMonth * hourlyCost;
  // Money at stake, weighted by how sure we are and by impact; evidence counts double a guess.
  const score = (perMonth + (highImpact ? hourlyCost * 4 : 0)) * (0.4 + p.confidence) * (evidenced ? 1.5 : 1);
  const hours = agentHoursPerMonth >= 10 ? Math.round(agentHoursPerMonth) : Math.round(agentHoursPerMonth * 10) / 10;
  const why = [
    agentHoursPerMonth >= 0.5 ? `an agent could take over about ${hours} h a month` : null,
    highImpact ? "it touches money, customers or growth" : null,
    evidenced ? "seen in your data" : "inferred, to confirm",
  ]
    .filter(Boolean)
    .join("; ");
  return { hoursPerMonth, agentHoursPerMonth, perMonth, highImpact, evidenced, score, why: why.charAt(0).toUpperCase() + why.slice(1) };
}

// Why a suggestion is left out, or null when it earns its place.
export function valueVerdict(p: ValueCandidate, v: ProcessValue): string | null {
  if (p.potentialAutonomyLevel <= p.currentAutonomyLevel) return "Nothing for an agent to take over";
  if (CHORE.test(`${p.title} ${p.description}`) && v.agentHoursPerMonth < 8) return "A routine chore with little at stake";
  if (!v.highImpact && v.agentHoursPerMonth < 1) return "Saves less than an hour a month";
  if (!v.evidenced && !v.highImpact && v.agentHoursPerMonth < 4) return "A guess with little at stake";
  return null;
}

// Keeps what truly adds value, most valuable first, up to `max`. The rest come back with the
// reason they were left out, so the summary can say how much was filtered and why.
export function rankByValue<T extends ValueCandidate>(items: T[], hourlyCost: number, max = 20): { kept: Array<T & { value: ProcessValue }>; dropped: Array<{ title: string; reason: string }> } {
  const scored = items.map((p) => ({ p, v: processValue(p, hourlyCost) }));
  const dropped: Array<{ title: string; reason: string }> = [];
  const keep: Array<T & { value: ProcessValue }> = [];
  for (const { p, v } of scored) {
    const reason = valueVerdict(p, v);
    if (reason) dropped.push({ title: p.title, reason });
    else keep.push({ ...p, value: v });
  }
  keep.sort((a, b) => b.value.score - a.value.score);
  for (const extra of keep.slice(max)) dropped.push({ title: extra.title, reason: "Lower value than the ones shown" });
  return { kept: keep.slice(0, max), dropped };
}
