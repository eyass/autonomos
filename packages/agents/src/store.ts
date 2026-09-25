import type { AgentDecision, AutonomyLevel, Instructions, PolicyConfig, TriggerConfig } from "@autonomos/schemas";
import type { ConnectionInfo, KnowledgeSearch, SandboxStore } from "@autonomos/integrations";
import type { ModelUsageRecord } from "@autonomos/ai";
import type { PolicyEvaluation } from "./policy";

// Persistence boundary for the run engine. Production uses the Supabase implementation
// (service role, every query scoped by organization_id); tests use the in-memory one.

export type Observation =
  | { kind: "trigger"; input: Record<string, unknown> }
  | { kind: "tool_result"; tool: string; args: Record<string, unknown>; result: unknown; simulated?: boolean }
  | { kind: "tool_error"; tool: string; args: Record<string, unknown>; error: string; code: string }
  | { kind: "policy"; tool: string; outcome: string; reasons: string[] }
  | { kind: "human"; decision: "approved" | "rejected" | "modified"; tool: string; comment?: string; changes?: Record<string, unknown> }
  | { kind: "draft"; tool: string; args: Record<string, unknown> };

export type PendingAction = {
  actionId: string;
  tool: string;
  args: Record<string, unknown>;
  idempotencyKey: string;
  approvalId: string | null;
  decision: AgentDecision;
};

export type RunState = {
  stepCount: number;
  decisionCount: number;
  writeCount: number;
  observations: Observation[];
  pending: PendingAction | null;
  wouldRequireApproval: Array<{ tool: string; args: Record<string, unknown>; reasons: string[] }>;
};

export const emptyRunState = (): RunState => ({
  stepCount: 0,
  decisionCount: 0,
  writeCount: 0,
  observations: [],
  pending: null,
  wouldRequireApproval: [],
});

export type RunStatus = "queued" | "running" | "waiting_for_approval" | "completed" | "failed" | "cancelled";

export type RunContext = {
  run: {
    id: string;
    organizationId: string;
    agentId: string;
    agentVersionId: string;
    processId: string;
    mode: "test" | "production";
    status: RunStatus;
    input: Record<string, unknown>;
    state: RunState;
    inputTokens: number;
    outputTokens: number;
    modelCost: number;
    model: string | null;
  };
  agent: { id: string; name: string; status: string };
  version: {
    id: string;
    version: number;
    autonomyLevel: AutonomyLevel;
    instructions: Instructions;
    trigger: TriggerConfig;
    policy: PolicyConfig;
    successCriteria: string[];
    modelClass: "FAST_MODEL" | "SMART_MODEL" | "AGENT_MODEL";
    tools: string[];
  };
  process: {
    id: string;
    title: string;
    description: string;
    departmentId: string | null;
    estimatedMinutesPerOccurrence: number | null;
  };
  organization: { id: string; name: string; description: string | null; industry: string | null; paused: boolean };
};

export type StepRecord = {
  type: string;
  description: string;
  input?: unknown;
  output?: unknown;
  tool?: string;
  model?: string;
  durationMs?: number;
  cost?: number;
  status: "succeeded" | "failed" | "skipped" | "waiting" | "simulated";
};

export type ActionRecord = {
  id: string;
  status: "pending" | "succeeded" | "failed" | "simulated" | "skipped";
  result: unknown;
};

export type ApprovalRecord = {
  id: string;
  status: "pending" | "approved" | "rejected" | "modified" | "expired";
  decision: { changes?: Record<string, unknown> } | null;
  comment: string | null;
  resolvedBy: string | null;
};

export interface RunStore {
  loadRun(runId: string): Promise<RunContext | null>;
  saveRun(
    ctx: RunContext,
    patch: Partial<{
      status: RunStatus;
      state: RunState;
      outcome: string;
      summary: string;
      output: unknown;
      success: boolean;
      error: string | null;
      errorRetryable: boolean | null;
      startedAt: Date;
      finishedAt: Date;
      model: string;
      humanMinutes: number;
      baselineMinutes: number | null;
      estimatedMinutesSaved: number;
    }>,
  ): Promise<void>;
  appendStep(ctx: RunContext, sequence: number, step: StepRecord): Promise<void>;
  // Inserts a pending action. If the idempotency key already exists, returns the existing row.
  upsertAction(
    ctx: RunContext,
    action: { tool: string; access: "read" | "write"; args: Record<string, unknown>; idempotencyKey: string; policy: PolicyEvaluation },
  ): Promise<ActionRecord>;
  getActionByKey(ctx: RunContext, idempotencyKey: string): Promise<ActionRecord | null>;
  finishAction(
    ctx: RunContext,
    actionId: string,
    patch: { status: ActionRecord["status"]; result?: unknown; error?: string; approvalRequestId?: string; args?: Record<string, unknown> },
  ): Promise<void>;
  countWriteActionsSince(ctx: RunContext, since: Date): Promise<number>;
  createApproval(
    ctx: RunContext,
    approval: {
      actionId: string;
      tool: string;
      actionType: string;
      title: string;
      description: string;
      proposedAction: Record<string, unknown>;
      modifiableFields: string[];
      evidence: Array<{ source: string; description: string }>;
      policyChecks: unknown;
      reasoningSummary: string;
      confidence: number | null;
      risk: number;
    },
  ): Promise<{ id: string }>;
  getApproval(ctx: RunContext, approvalId: string): Promise<ApprovalRecord | null>;
  recordIntervention(
    ctx: RunContext,
    intervention: { type: "approval" | "exception" | "correction" | "manual_completion" | "override" | "information_request"; description: string; minutes: number; approvalId?: string; userId?: string | null },
  ): Promise<void>;
  sumInterventionMinutes(ctx: RunContext): Promise<number>;
  recordActivity(ctx: RunContext, activity: { actionType: string; status: string; title: string; detail?: Record<string, unknown> }): Promise<void>;
  recordAudit(ctx: RunContext, audit: { action: string; system?: string; tool?: string; input?: unknown; output?: unknown; approvalStatus?: string; result: string; model?: string }): Promise<void>;
  recordModelUsage(ctx: RunContext, usage: ModelUsageRecord): Promise<void>;
  notify(ctx: RunContext, notification: { kind: "approval_required" | "agent_failed" | "agent_escalation"; title: string; body: string; link: string }): Promise<void>;
  isOrganizationPaused(ctx: RunContext): Promise<boolean>;
  getAgentStatus(ctx: RunContext): Promise<string>;
  connectionFor(ctx: RunContext, integration: string): Promise<ConnectionInfo | null>;
  sandbox(ctx: RunContext): SandboxStore;
  knowledge(ctx: RunContext): KnowledgeSearch;
}
