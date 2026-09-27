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

// Guardrails a regulated area puts on any agent for the process, applied in code (never only in
// its instructions) when the agent is created or changed.
//  - Debt collection, personal data and consent, legal, financial reporting: at most L3 (the agent
//    proposes, a person approves) and every action that changes something needs approval.
//  - Refunds and payments: at most L4, money moves above a small amount need approval, and a hard
//    ceiling applies per action.
export const MONEY_APPROVAL_ABOVE = 50;
export const MONEY_HARD_LIMIT = 500;
const STRICT = new Set(["debt collection", "personal data and consent", "legal and contracts", "financial reporting"]);
const MONEY_TOOL = /refund|payment|payout|charge|transfer/i;

type GuardedConfig = {
  autonomyLevel: number;
  tools: string[];
  policy: {
    approvalRequiredFor: string[];
    amountThresholds: Array<{ tool: string; field: string; maxWithoutApproval: number }>;
    hardLimits: Array<{ tool: string; field: string; max: number }>;
  };
};

export function guardrailsFor(areas: string[]): { maxLevel: number; approveAllWrites: boolean; moneyLimits: boolean; rules: string[] } {
  const strict = areas.some((a) => STRICT.has(a));
  const money = areas.includes("refunds and payments");
  const rules: string[] = [];
  if (strict) rules.push("At most L3: the agent proposes, a person approves", "Every action that changes something needs approval");
  else if (money) rules.push("At most L4");
  if (money) rules.push(`Money over ${MONEY_APPROVAL_ABOVE} per action needs approval`, `No single money action above ${MONEY_HARD_LIMIT}`);
  return { maxLevel: strict ? 3 : money ? 4 : 5, approveAllWrites: strict, moneyLimits: money, rules };
}

export function applyGuardrails<T extends GuardedConfig>(config: T, areas: string[], writeTools: string[]): T {
  const g = guardrailsFor(areas);
  if (!areas.length) return config;
  // Only tools that move money (writes); reading payments is not moving money.
  const moneyTools = writeTools.filter((t) => config.tools.includes(t) && MONEY_TOOL.test(t));
  const thresholds = config.policy.amountThresholds.map((x) => ({ ...x }));
  const limits = config.policy.hardLimits.map((x) => ({ ...x }));
  if (g.moneyLimits) {
    for (const tool of moneyTools) {
      const t = thresholds.find((x) => x.tool === tool);
      if (t) t.maxWithoutApproval = Math.min(t.maxWithoutApproval, MONEY_APPROVAL_ABOVE);
      else thresholds.push({ tool, field: "amount", maxWithoutApproval: MONEY_APPROVAL_ABOVE });
      const l = limits.find((x) => x.tool === tool);
      if (l) l.max = Math.min(l.max, MONEY_HARD_LIMIT);
      else limits.push({ tool, field: "amount", max: MONEY_HARD_LIMIT });
    }
  }
  return {
    ...config,
    autonomyLevel: Math.min(config.autonomyLevel, g.maxLevel),
    policy: {
      ...config.policy,
      approvalRequiredFor: g.approveAllWrites ? [...new Set([...config.policy.approvalRequiredFor, ...writeTools])] : config.policy.approvalRequiredFor,
      amountThresholds: thresholds,
      hardLimits: limits,
    },
  };
}
