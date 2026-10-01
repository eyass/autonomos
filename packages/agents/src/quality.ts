// How much a discovered process can be trusted, and whether it touches an area that needs a
// compliance owner. Pure functions shared by saving, approving and generating ideas.

export type ProcessForQuality = {
  confidence: number | null;
  stepsCount: number;
  estimatedOccurrencesPerMonth: number | null;
  estimatedMinutesPerOccurrence: number | null;
  // Evidence lines from connected systems or documents. Left out where it is not known, which
  // skips the evidence rule.
  evidenceCount?: number;
};

export const MIN_CONFIDENCE = 0.5;
// An AI draft with no evidence behind it needs more confidence than one seen in the data, or a
// person to confirm it (editing a process clears the AI's confidence).
export const MIN_UNEVIDENCED_CONFIDENCE = 0.6;
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

// An AI guess nothing in the data backs: it may sit in the inventory as a draft, but a person
// confirms it matches how the work is really done before it is approved or automated.
export function needsConfirmation(p: ProcessForQuality): boolean {
  return p.confidence !== null && p.evidenceCount === 0 && p.confidence < MIN_UNEVIDENCED_CONFIDENCE;
}

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
//  - Debt collection, personal data and consent, legal, financial reporting: at most Approve (the agent
//    proposes, a person approves) and every action that changes something needs approval.
//  - Refunds and payments: at most Auto, money moves above a small amount need approval, and a hard
//    ceiling applies per action.
export const MONEY_APPROVAL_ABOVE = 50;
export const MONEY_HARD_LIMIT = 500;
const STRICT = new Set(["debt collection", "personal data and consent", "legal and contracts", "financial reporting"]);
const MONEY_TOOL = /refund|payment|payout|charge|transfer/i;

// The company's own policy numbers a regulated area needs before an agent may work in it. They
// are asked for on the process, required before an agent is built or goes live, and turned into
// rules in code where the policy engine can enforce them (money amounts); the rest become the
// agent's written rules and escalation conditions, on top of every action needing approval.
export type PolicyField = { key: string; label: string; unit: "money" | "days" | "count" | "text" };
export type PolicyValues = Record<string, string | number>;

export const POLICY_TEMPLATES: Record<string, PolicyField[]> = {
  "refunds and payments": [
    { key: "approvalAbove", label: "A person approves refunds or payments above", unit: "money" },
    { key: "maxPerAction", label: "Never refund or pay more than, in one action", unit: "money" },
    { key: "windowDays", label: "Refund window after purchase", unit: "days" },
  ],
  "debt collection": [
    { key: "minBalance", label: "Smallest overdue balance to chase", unit: "money" },
    { key: "escalateAbove", label: "Hand to a person (small claims or legal) above", unit: "money" },
    { key: "graceDays", label: "Days after the due date before the first reminder", unit: "days" },
    { key: "maxRemindersPerMonth", label: "Most reminders per customer per month", unit: "count" },
  ],
  "personal data and consent": [
    { key: "lawfulBasis", label: "Lawful basis for this processing", unit: "text" },
    { key: "responseDays", label: "Deadline to answer a data request", unit: "days" },
  ],
};

const filled = (v: unknown) => (typeof v === "number" ? Number.isFinite(v) && v >= 0 : typeof v === "string" && v.trim().length > 0);

export function policyFieldsFor(areas: string[]): Array<PolicyField & { area: string }> {
  return areas.flatMap((area) => (POLICY_TEMPLATES[area] ?? []).map((f) => ({ ...f, area })));
}

// What is still missing, one line per area.
export function policyGaps(areas: string[], values: PolicyValues): string[] {
  const gaps: string[] = [];
  for (const area of areas) {
    const missing = (POLICY_TEMPLATES[area] ?? []).filter((f) => !filled(values[f.key]));
    if (missing.length) gaps.push(`set the ${area} policy: ${missing.map((f) => f.label.toLowerCase()).join("; ")}`);
  }
  return gaps;
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

// The policy as the agent's written rules and escalation conditions.
export function policyRules(areas: string[], v: PolicyValues): { rules: string[]; escalations: string[] } {
  const rules: string[] = [];
  const escalations: string[] = [];
  if (areas.includes("refunds and payments") && filled(v.windowDays)) rules.push(`Refunds only within ${num(v.windowDays)} days of purchase; outside it, hand to a person`);
  if (areas.includes("debt collection")) {
    if (filled(v.minBalance)) rules.push(`Do not chase balances below ${num(v.minBalance)}`);
    if (filled(v.graceDays)) rules.push(`No reminder until ${num(v.graceDays)} days after the due date`);
    if (filled(v.maxRemindersPerMonth)) rules.push(`At most ${num(v.maxRemindersPerMonth)} reminders per customer per month`);
    if (filled(v.escalateAbove)) escalations.push(`The balance is above ${num(v.escalateAbove)}: hand to a person for small claims or legal`);
  }
  if (areas.includes("personal data and consent")) {
    if (filled(v.lawfulBasis)) rules.push(`Process personal data only on this basis: ${String(v.lawfulBasis).trim()}`);
    if (filled(v.responseDays)) escalations.push(`A data request is older than ${Math.max(1, num(v.responseDays) - 5)} days: hand to a person before the ${num(v.responseDays)}-day deadline`);
  }
  return { rules, escalations };
}

type GuardedConfig = {
  autonomyLevel: number;
  tools: string[];
  instructions?: { rules: string[]; escalationConditions: string[] };
  policy: {
    approvalRequiredFor: string[];
    amountThresholds: Array<{ tool: string; field: string; maxWithoutApproval: number }>;
    hardLimits: Array<{ tool: string; field: string; max: number }>;
  };
};

export function guardrailsFor(
  areas: string[],
  policy: PolicyValues = {},
): { maxLevel: number; approveAllWrites: boolean; moneyLimits: boolean; approvalAbove: number; hardLimit: number; rules: string[] } {
  const strict = areas.some((a) => STRICT.has(a));
  const money = areas.includes("refunds and payments");
  // The company's numbers can only tighten the platform limits, never loosen them.
  const approvalAbove = filled(policy.approvalAbove) ? Math.min(MONEY_APPROVAL_ABOVE, num(policy.approvalAbove)) : MONEY_APPROVAL_ABOVE;
  const hardLimit = filled(policy.maxPerAction) ? Math.min(MONEY_HARD_LIMIT, num(policy.maxPerAction)) : MONEY_HARD_LIMIT;
  const rules: string[] = [];
  if (strict) rules.push("At most Approve: the agent proposes, a person approves", "Every action that changes something needs approval");
  else if (money) rules.push("At most Auto, with approval above the money limit");
  if (money) rules.push(`Money over ${approvalAbove} per action needs approval`, `No single money action above ${hardLimit}`);
  rules.push(...policyRules(areas, policy).rules, ...policyRules(areas, policy).escalations);
  return { maxLevel: strict ? 3 : money ? 4 : 5, approveAllWrites: strict, moneyLimits: money, approvalAbove, hardLimit, rules };
}

export function applyGuardrails<T extends GuardedConfig>(config: T, areas: string[], writeTools: string[], policy: PolicyValues = {}): T {
  const g = guardrailsFor(areas, policy);
  if (!areas.length) return config;
  const { approvalAbove, hardLimit } = g;
  // Only tools that move money (writes); reading payments is not moving money.
  const moneyTools = writeTools.filter((t) => config.tools.includes(t) && MONEY_TOOL.test(t));
  const thresholds = config.policy.amountThresholds.map((x) => ({ ...x }));
  const limits = config.policy.hardLimits.map((x) => ({ ...x }));
  if (g.moneyLimits) {
    for (const tool of moneyTools) {
      const t = thresholds.find((x) => x.tool === tool);
      if (t) t.maxWithoutApproval = Math.min(t.maxWithoutApproval, approvalAbove);
      else thresholds.push({ tool, field: "amount", maxWithoutApproval: approvalAbove });
      const l = limits.find((x) => x.tool === tool);
      if (l) l.max = Math.min(l.max, hardLimit);
      else limits.push({ tool, field: "amount", max: hardLimit });
    }
  }
  const written = policyRules(areas, policy);
  const instructions = config.instructions
    ? {
        ...config.instructions,
        rules: [...new Set([...config.instructions.rules, ...written.rules])],
        escalationConditions: [...new Set([...config.instructions.escalationConditions, ...written.escalations])],
      }
    : undefined;
  return {
    ...config,
    ...(instructions ? { instructions } : {}),
    autonomyLevel: Math.min(config.autonomyLevel, g.maxLevel),
    policy: {
      ...config.policy,
      approvalRequiredFor: g.approveAllWrites ? [...new Set([...config.policy.approvalRequiredFor, ...writeTools])] : config.policy.approvalRequiredFor,
      amountThresholds: thresholds,
      hardLimits: limits,
    },
  };
}
