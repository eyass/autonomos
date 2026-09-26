import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export const AutonomyLevel = z.number().int().min(1).max(5);
export type AutonomyLevel = 1 | 2 | 3 | 4 | 5;

export const Score = z.number().int().min(1).max(5);

export const AUTONOMY_LEVELS = [
  { level: 1, code: "L1", name: "Human only", short: "Humans do the work" },
  { level: 2, code: "L2", name: "Agent assists", short: "Agent researches and drafts, humans act" },
  { level: 3, code: "L3", name: "Agent proposes", short: "Agent prepares the action, humans approve" },
  { level: 4, code: "L4", name: "Agent executes with exceptions", short: "Agent acts, humans handle exceptions" },
  { level: 5, code: "L5", name: "Autonomous", short: "Agent runs the process, humans monitor" },
] as const;

// PRD section 49. Coefficients used by the company autonomy score.
export const AUTONOMY_COEFFICIENTS: Record<AutonomyLevel, number> = {
  1: 0,
  2: 0.2,
  3: 0.4,
  4: 0.75,
  5: 1,
};

export const ProcessFrequency = z.enum(["ad_hoc", "daily", "weekly", "monthly", "event_driven"]);
export const ProcessStatus = z.enum(["draft", "reviewed", "active", "archived"]);
export const DiscoverySource = z.enum(["interview", "document", "integration", "manual"]);
export const OpportunityStatus = z.enum(["suggested", "reviewing", "approved", "building", "live", "rejected", "archived"]);
export const AgentStatus = z.enum(["draft", "testing", "active", "paused", "error", "archived"]);
export const RunStatus = z.enum(["queued", "running", "waiting_for_approval", "completed", "failed", "cancelled"]);
export const RunMode = z.enum(["test", "production"]);
export const ApprovalStatus = z.enum(["pending", "approved", "rejected", "modified", "expired"]);
export const InterventionType = z.enum(["approval", "exception", "correction", "manual_completion", "override", "information_request"]);
export const MemberRole = z.enum(["owner", "admin", "member"]);

export const DEPARTMENTS = ["Customer Support", "Sales", "Finance", "Marketing", "Operations", "Product", "Engineering", "HR", "Other"] as const;

export const EMPLOYEE_COUNTS = ["1–19", "20–49", "50–99", "100–249", "250–499", "500+"] as const;

export const INDUSTRIES = [
  "SaaS",
  "Marketplace",
  "E-commerce",
  "Recruitment",
  "Property services",
  "Travel",
  "Agency",
  "Online education",
  "Professional services",
  "Insurance intermediary",
  "Other",
] as const;

export const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SEK", "DKK", "NOK", "PLN", "CAD", "AUD"] as const;

// ---------------------------------------------------------------------------
// Company profile, drafted from the company website during onboarding
// ---------------------------------------------------------------------------

export const LikelyProcessSchema = z.object({
  title: z.string().min(1).describe("Name of the recurring work, in plain business language, for example Refund request handling"),
  department: z.enum(DEPARTMENTS),
  description: z.string().describe("One sentence on what the work involves"),
  evidence: z.string().describe("What on the website or in the detected tools suggests this work exists"),
});

export const CompanyProfileSchema = z.object({
  name: z.string().min(1).describe("The company's trading name, without legal suffixes like BV or Ltd unless that is how it presents itself"),
  summary: z.string().min(10).describe("Two to four plain sentences: what the company sells, to whom, and how it operates day to day"),
  industry: z.enum(INDUSTRIES),
  employeeCount: z.enum(EMPLOYEE_COUNTS).nullable().describe("Only when the site states or clearly implies the headcount; otherwise null"),
  country: z.string().nullable().describe("Country of the head office, in English, for example Netherlands"),
  currency: z.enum(CURRENCIES),
  hourlyCostEstimate: z.number().positive().max(2000).describe("Typical fully loaded hourly labour cost of operational staff in that country, in the currency"),
  improvementAreas: z.array(z.enum(DEPARTMENTS)).min(1).max(4).describe("Departments where recurring work is most likely, most promising first"),
  customers: z.string().nullable().describe("Who the customers are, for example consumers buying second-hand furniture"),
  likelyProcesses: z.array(LikelyProcessSchema).max(15),
  evidence: z
    .array(z.object({ field: z.string(), source: z.string() }))
    .max(12)
    .describe("Where each important field came from, for example industry: homepage headline"),
  confidence: z.number().min(0).max(1),
});
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

export const InterviewSuggestionsSchema = z.object({
  suggestions: z.array(z.string().min(1).max(300)).max(3).describe("Short answers the user can send as-is"),
});

// ---------------------------------------------------------------------------
// Process discovery (PRD section 103)
// ---------------------------------------------------------------------------

export const DiscoveredStepSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  system: z.string().optional(),
  performedBy: z.string().optional(),
  actionType: z.string().optional(),
  requiresJudgement: z.boolean().optional(),
  risk: Score.optional(),
  estimatedDurationMinutes: z.number().nonnegative().optional(),
});
export type DiscoveredStep = z.infer<typeof DiscoveredStepSchema>;

export const DiscoveredProcessSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  department: z.string(),
  trigger: z.string().optional(),
  frequency: ProcessFrequency.optional(),
  estimatedOccurrencesPerMonth: z.number().nonnegative().optional(),
  estimatedMinutesPerOccurrence: z.number().nonnegative().optional(),
  systems: z.array(z.string()),
  roles: z.array(z.string()),
  steps: z.array(DiscoveredStepSchema),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  decisionPoints: z.array(z.string()).default([]),
  exceptions: z.array(z.string()).default([]),
  currentAutonomyLevel: AutonomyLevel,
  potentialAutonomyLevel: AutonomyLevel,
  businessValue: Score,
  automationDifficulty: Score,
  riskLevel: Score,
  missingInformation: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
export type DiscoveredProcess = z.infer<typeof DiscoveredProcessSchema>;

// One turn of the guided interview: extracted processes so far plus the next question.
export const DiscoveryTurnSchema = z.object({
  processes: z.array(DiscoveredProcessSchema),
  nextQuestion: z.string().nullable().describe("A single targeted follow-up question, or null when discovery for this area is complete."),
  questionTargetsProcess: z.string().nullable().describe("Title of the process the follow-up question is about, if any."),
  done: z.boolean(),
});
export type DiscoveryTurn = z.infer<typeof DiscoveryTurnSchema>;

export const DocumentExtractionSchema = z.object({
  processes: z.array(DiscoveredProcessSchema),
});

export const GeneratedWorkflowSchema = z.object({
  trigger: z.string().optional(),
  steps: z.array(DiscoveredStepSchema).min(1),
  systems: z.array(z.string()),
  roles: z.array(z.string()),
  // Filled so a manually added process needs only a name and a sentence.
  department: z.enum(DEPARTMENTS).optional().describe("The department that owns this work"),
  frequency: ProcessFrequency.optional(),
  estimatedOccurrencesPerMonth: z.number().nonnegative().optional(),
  estimatedMinutesPerOccurrence: z.number().nonnegative().optional(),
});

// ---------------------------------------------------------------------------
// Opportunity generation (PRD section 104)
// ---------------------------------------------------------------------------

export const FutureStateStepSchema = z.object({
  title: z.string(),
  actor: z.enum(["agent", "human", "system"]),
  approval: z.boolean().optional(),
});

export const GeneratedOpportunitySchema = z.object({
  title: z.string(),
  description: z.string(),
  problem: z.string(),
  proposedFutureState: z.string(),
  futureStateSteps: z.array(FutureStateStepSchema),
  proposedAgent: z.object({
    name: z.string(),
    objective: z.string(),
    responsibilities: z.array(z.string()),
  }),
  currentAutonomyLevel: AutonomyLevel,
  targetAutonomyLevel: AutonomyLevel,
  estimatedHoursSavedMonthly: z.number().nonnegative().optional(),
  businessValue: Score,
  automationDifficulty: Score,
  riskLevel: Score,
  requiredSystems: z.array(z.string()),
  requiredHumanApprovals: z.array(z.string()),
  humanInvolvement: z.array(z.string()),
  majorRisks: z.array(z.string()),
  rationale: z.string(),
  evidence: z
    .array(z.object({ source: z.string().describe("Where the fact comes from, for example Process inventory, Zendesk or Stripe"), detail: z.string() }))
    .max(6)
    .describe("Concrete facts from the process data and connected systems that justify this opportunity. Never invent numbers."),
});
export type GeneratedOpportunity = z.infer<typeof GeneratedOpportunitySchema>;

export const OpportunityGenerationSchema = z.object({
  opportunities: z.array(GeneratedOpportunitySchema),
});

// ---------------------------------------------------------------------------
// Agent configuration (PRD sections 31-35, 101)
// ---------------------------------------------------------------------------

export const INTEGRATION_EVENTS = [
  { key: "zendesk.ticket.created", label: "Zendesk ticket created", integration: "zendesk" },
  { key: "stripe.payment.failed", label: "Stripe payment failed", integration: "stripe" },
  { key: "hubspot.deal.stage_changed", label: "HubSpot deal stage changed", integration: "hubspot" },
] as const;

export const IntegrationEventKey = z.enum(INTEGRATION_EVENTS.map((e) => e.key) as [string, ...string[]]);

export const TriggerConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("manual") }),
  z.object({
    type: z.literal("schedule"),
    cron: z.string().min(9),
    timezone: z.string().default("Europe/Amsterdam"),
  }),
  z.object({
    type: z.literal("integration_event"),
    event: IntegrationEventKey,
  }),
]);
export type TriggerConfig = z.infer<typeof TriggerConfigSchema>;

export const InstructionsSchema = z.object({
  objective: z.string().min(1),
  context: z.string().default(""),
  rules: z.array(z.string()).default([]),
  steps: z.array(z.string()).default([]),
  escalationConditions: z.array(z.string()).default([]),
  successConditions: z.array(z.string()).default([]),
});
export type Instructions = z.infer<typeof InstructionsSchema>;

// Deterministic policy (PRD sections 34, 64, 109). Evaluated in code, never only in prompts.
export const AmountThresholdSchema = z.object({
  tool: z.string(),
  field: z.string(),
  maxWithoutApproval: z.number().nonnegative(),
});

export const HardLimitSchema = z.object({
  tool: z.string(),
  field: z.string(),
  max: z.number().nonnegative(),
});

export const ConditionRuleSchema = z.object({
  tool: z.string().describe("Tool key or * for any write tool"),
  field: z.string().describe("Argument path, e.g. customer_segment"),
  operator: z.enum(["equals", "not_equals", "in", "greater_than", "less_than"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  effect: z.enum(["require_approval", "deny"]),
  label: z.string(),
});
export type ConditionRule = z.infer<typeof ConditionRuleSchema>;

export const WorkingHoursSchema = z.object({
  timezone: z.string(),
  days: z.array(z.number().int().min(0).max(6)),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

export const PolicyConfigSchema = z.object({
  confidenceThreshold: z.number().min(0).max(1).default(0.9),
  approvalRequiredFor: z.array(z.string()).default([]),
  amountThresholds: z.array(AmountThresholdSchema).default([]),
  hardLimits: z.array(HardLimitSchema).default([]),
  conditions: z.array(ConditionRuleSchema).default([]),
  workingHours: WorkingHoursSchema.nullable().default(null),
  maxActionsPerRun: z.number().int().positive().default(10),
  maxActionsPerDay: z.number().int().positive().default(200),
  maxStepsPerRun: z.number().int().positive().default(15),
});
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;

export const ModelConfigSchema = z.object({
  modelClass: z.enum(["FAST_MODEL", "SMART_MODEL", "AGENT_MODEL"]).default("AGENT_MODEL"),
});

export const AgentConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  autonomyLevel: AutonomyLevel,
  instructions: InstructionsSchema,
  trigger: TriggerConfigSchema,
  tools: z.array(z.string()).min(1),
  policy: PolicyConfigSchema,
  successCriteria: z.array(z.string()).default([]),
  modelConfig: ModelConfigSchema.default({ modelClass: "AGENT_MODEL" }),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// ---------------------------------------------------------------------------
// Agent decision contract (PRD section 102)
// ---------------------------------------------------------------------------

export const AgentDecisionSchema = z.object({
  summary: z.string().describe("One sentence describing this step for the activity log."),
  decision: z
    .enum(["continue", "execute", "request_approval", "escalate", "stop"])
    .describe(
      "continue: call a read tool to gather information. execute: perform a write action. request_approval: perform a write action you believe needs a human. escalate: hand to a human, you cannot proceed. stop: the task is finished.",
    ),
  confidence: z.number().min(0).max(1).optional(),
  reasoningSummary: z.string(),
  proposedTool: z.string().optional(),
  proposedArguments: z.record(z.string(), z.unknown()).optional(),
  evidence: z.array(z.object({ source: z.string(), description: z.string() })).optional(),
  policyChecks: z.array(z.object({ rule: z.string(), passed: z.boolean() })),
  outcome: z
    .object({
      result: z.string(),
      success: z.boolean(),
    })
    .optional()
    .describe("Required when decision is stop or escalate."),
});
export type AgentDecision = z.infer<typeof AgentDecisionSchema>;

// Draft agent generated from an opportunity (agent wizard pre-fill).
export const GeneratedAgentDraftSchema = z.object({
  name: z.string(),
  objective: z.string(),
  successCriteria: z.array(z.string()),
  instructions: InstructionsSchema,
  suggestedTools: z.array(z.string()),
  suggestedTrigger: TriggerConfigSchema,
});
export type GeneratedAgentDraft = z.infer<typeof GeneratedAgentDraftSchema>;

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export const ApprovalDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), comment: z.string().optional() }),
  z.object({ decision: z.literal("reject"), comment: z.string().optional() }),
  z.object({
    decision: z.literal("modify"),
    changes: z.record(z.string(), z.unknown()),
    comment: z.string().optional(),
  }),
]);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

// ---------------------------------------------------------------------------
// Analytics events (PRD section 94)
// ---------------------------------------------------------------------------

export const ANALYTICS_EVENTS = [
  "user_signed_up",
  "organization_created",
  "onboarding_started",
  "onboarding_completed",
  "integration_connected",
  "process_discovery_started",
  "process_created",
  "process_reviewed",
  "opportunity_generated",
  "opportunity_approved",
  "agent_created",
  "agent_test_started",
  "agent_test_completed",
  "agent_activated",
  "agent_paused",
  "agent_run_started",
  "agent_run_completed",
  "agent_run_failed",
  "approval_requested",
  "approval_approved",
  "approval_rejected",
  "human_override",
  "autonomy_changed",
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

// Plan limits. Runs above the monthly allowance keep working and are billed as overage;
// active agents above the limit cannot be activated until one is paused or the plan changes.
export const PLANS = {
  design_partner: { name: "Design partner", activeAgents: 5, runsPerMonth: 2000, overagePerRun: 0.05, price: null },
  starter: { name: "Starter", activeAgents: 3, runsPerMonth: 1000, overagePerRun: 0.08, price: 490 },
  growth: { name: "Growth", activeAgents: 15, runsPerMonth: 10000, overagePerRun: 0.05, price: 1900 },
} as const;
export type PlanKey = keyof typeof PLANS;
export function planFor(key: string | null | undefined) {
  return PLANS[(key ?? "design_partner") as PlanKey] ?? PLANS.design_partner;
}

// Processes proposed from what discovery read in connected systems, each with its evidence.
export const SystemProcessProposalSchema = DiscoveredProcessSchema.extend({
  evidence: z
    // No min/max here: Gemini rejects array limits in this schema. Limits are applied in code.
    .array(z.object({ source: z.string().describe("The system, e.g. Gmail or Zendesk"), detail: z.string().describe("What in the data shows this work, with counts") }))
    .describe("One to five pieces of evidence"),
});
export type SystemProcessProposal = z.infer<typeof SystemProcessProposalSchema>;

export const SystemDiscoverySchema = z.object({
  summary: z.string().describe("Two sentences on what the data shows about how the company works"),
  processes: z.array(SystemProcessProposalSchema).describe("Every recurring process found, most evidenced first"),
});
export type SystemDiscovery = z.infer<typeof SystemDiscoverySchema>;
