// How much a discovered process can be trusted, and whether it touches an area that needs a
// compliance owner. Pure functions shared by saving, approving and generating ideas.

export type ProcessForQuality = {
  confidence: number | null;
  stepsCount: number;
  estimatedOccurrencesPerMonth: number | null;
  estimatedMinutesPerOccurrence: number | null;
};

export const MIN_CONFIDENCE = 0.5;
export const MIN_STEPS = 2;

// What is missing before a process belongs in the working inventory (and can be approved).
export function qualityGaps(p: ProcessForQuality): string[] {
  const gaps: string[] = [];
  if (p.confidence !== null && p.confidence < MIN_CONFIDENCE) gaps.push(`AI confidence is ${Math.round(p.confidence * 100)}%; confirm the details`);
  if (p.stepsCount < MIN_STEPS) gaps.push(p.stepsCount ? "Only one step; describe the workflow" : "No steps yet; describe the workflow");
  if (!p.estimatedOccurrencesPerMonth) gaps.push("How often it happens");
  if (!p.estimatedMinutesPerOccurrence) gaps.push("How long it takes each time");
  return gaps;
}

export const isThin = (p: ProcessForQuality) => qualityGaps(p).length > 0;

// Scores claimed from thin evidence are held back: a process nobody has described yet is not
// 5/5 value, and its automation target stays one level above today.
export function tempered<T extends { businessValue: number; potentialAutonomyLevel: number; currentAutonomyLevel: number }>(scores: T, thin: boolean): T {
  if (!thin) return scores;
  return { ...scores, businessValue: Math.min(scores.businessValue, 3), potentialAutonomyLevel: Math.min(scores.potentialAutonomyLevel, scores.currentAutonomyLevel + 1) };
}

const SENSITIVE: Array<[string, RegExp]> = [
  ["debt collection", /\b(collections?|debt|dunning|overdue|arrears|recover(y|ies))\b/i],
  ["refunds and payments", /\b(refunds?|chargebacks?|payments?|payouts?|invoices?|billing|charges?)\b/i],
  ["personal data and consent", /\b(consent|gdpr|personal data|data (subject|deletion|removal)|privacy|dsar)\b/i],
  ["legal and contracts", /\b(legal|contracts?|lawsuit|litigation|terms of service)\b/i],
  ["financial reporting", /\b(financial (report|statement|close)|accounting|tax|vat|payroll)\b/i],
];

// The regulated areas a process touches, from its name, description and steps.
export function sensitiveAreas(text: string): string[] {
  return SENSITIVE.filter(([, re]) => re.test(text)).map(([label]) => label);
}
