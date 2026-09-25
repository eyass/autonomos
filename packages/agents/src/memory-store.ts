import type { SandboxRecord, SandboxStore } from "@autonomos/integrations";
import type { ModelUsageRecord } from "@autonomos/ai";
import type { ActionRecord, ApprovalRecord, RunContext, RunStore, StepRecord } from "./store";

// In-memory RunStore used by tests and local scripts. Mirrors the Supabase store's semantics,
// including the unique idempotency key on actions.
export class MemoryRunStore implements RunStore {
  runs = new Map<string, RunContext>();
  steps: Array<{ runId: string; sequence: number } & StepRecord> = [];
  actions = new Map<string, ActionRecord & { key: string; tool: string; args: Record<string, unknown>; createdAt: Date; approvalRequestId?: string }>();
  approvals = new Map<string, ApprovalRecord & { title: string; proposedAction: Record<string, unknown>; tool: string }>();
  interventions: Array<{ type: string; description: string; minutes: number; runId: string }> = [];
  activity: Array<{ title: string; actionType: string; status: string }> = [];
  audit: Array<{ action: string; tool?: string; result: string }> = [];
  usage: ModelUsageRecord[] = [];
  notifications: Array<{ kind: string; title: string }> = [];
  sandboxData = new Map<string, SandboxRecord>();
  paused = false;
  agentStatus = "active";
  connections: Record<string, "sandbox" | "composio"> = { zendesk: "sandbox", stripe: "sandbox", slack: "sandbox", gmail: "sandbox" };
  toolCallLog: string[] = [];
  private seq = 0;

  private id(prefix: string) {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  async loadRun(runId: string) {
    const ctx = this.runs.get(runId);
    return ctx ? structuredClone(ctx) : null;
  }

  async saveRun(ctx: RunContext, patch: Parameters<RunStore["saveRun"]>[1]) {
    const stored = this.runs.get(ctx.run.id)!;
    if (patch.status) stored.run.status = patch.status;
    if (patch.state) stored.run.state = structuredClone(patch.state);
    Object.assign(stored.run, {
      inputTokens: ctx.run.inputTokens,
      outputTokens: ctx.run.outputTokens,
      modelCost: ctx.run.modelCost,
    });
    (stored.run as Record<string, unknown>).last = { ...((stored.run as Record<string, unknown>).last as object), ...patch };
  }

  result(runId: string) {
    return (this.runs.get(runId)!.run as unknown as { last: Record<string, unknown> }).last ?? {};
  }

  async appendStep(ctx: RunContext, sequence: number, step: StepRecord) {
    if (this.steps.some((s) => s.runId === ctx.run.id && s.sequence === sequence)) throw new Error(`duplicate step ${sequence}`);
    this.steps.push({ runId: ctx.run.id, sequence, ...step });
  }

  async upsertAction(_ctx: RunContext, a: { tool: string; args: Record<string, unknown>; idempotencyKey: string }) {
    const existing = [...this.actions.values()].find((x) => x.key === a.idempotencyKey);
    if (existing) return existing;
    const record = { id: this.id("act"), status: "pending" as const, result: null, key: a.idempotencyKey, tool: a.tool, args: a.args, createdAt: new Date() };
    this.actions.set(record.id, record);
    return record;
  }

  async getActionByKey(_ctx: RunContext, key: string) {
    return [...this.actions.values()].find((x) => x.key === key) ?? null;
  }

  async finishAction(_ctx: RunContext, id: string, patch: { status: ActionRecord["status"]; result?: unknown; approvalRequestId?: string; args?: Record<string, unknown> }) {
    const a = this.actions.get(id)!;
    a.status = patch.status;
    if (patch.result !== undefined) a.result = patch.result;
    if (patch.approvalRequestId) a.approvalRequestId = patch.approvalRequestId;
    if (patch.args) a.args = patch.args;
  }

  async countWriteActionsSince(_ctx: RunContext, since: Date) {
    return [...this.actions.values()].filter((a) => a.createdAt >= since && a.status === "succeeded").length;
  }

  async createApproval(_ctx: RunContext, a: { title: string; proposedAction: Record<string, unknown>; tool: string }) {
    const id = this.id("apr");
    this.approvals.set(id, { id, status: "pending", decision: null, comment: null, resolvedBy: null, title: a.title, proposedAction: a.proposedAction, tool: a.tool });
    return { id };
  }

  async getApproval(_ctx: RunContext, id: string) {
    return this.approvals.get(id) ?? null;
  }

  resolveApproval(id: string, status: "approved" | "rejected" | "modified" | "expired", changes?: Record<string, unknown>) {
    const a = this.approvals.get(id)!;
    a.status = status;
    a.decision = changes ? { changes } : null;
    if (status !== "expired") this.interventions.push({ type: "approval", description: status, minutes: status === "modified" ? 2 : 1, runId: "" });
  }

  async recordIntervention(ctx: RunContext, i: { type: string; description: string; minutes: number }) {
    this.interventions.push({ ...i, runId: ctx.run.id });
  }

  async sumInterventionMinutes() {
    return this.interventions.reduce((s, i) => s + i.minutes, 0);
  }

  async recordActivity(_ctx: RunContext, a: { title: string; actionType: string; status: string }) {
    this.activity.push(a);
  }

  async recordAudit(_ctx: RunContext, a: { action: string; tool?: string; result: string }) {
    this.audit.push(a);
  }

  async recordModelUsage(_ctx: RunContext, u: ModelUsageRecord) {
    this.usage.push(u);
  }

  async notify(_ctx: RunContext, n: { kind: string; title: string }) {
    this.notifications.push(n);
  }

  async isOrganizationPaused() {
    return this.paused;
  }

  async getAgentStatus() {
    return this.agentStatus;
  }

  async connectionFor(_ctx: RunContext, integration: string) {
    const provider = this.connections[integration];
    return provider ? { integration, provider, externalAccountId: null } : null;
  }

  sandbox(): SandboxStore {
    const key = (system: string, kind: string, id: string) => `${system}/${kind}/${id}`;
    return {
      get: async (system, kind, id) => structuredClone(this.sandboxData.get(key(system, kind, id)) ?? null),
      list: async (system, kind) =>
        [...this.sandboxData.entries()].filter(([k]) => k.startsWith(`${system}/${kind}/`)).map(([, v]) => structuredClone(v)),
      put: async (system, kind, record) => {
        this.toolCallLog.push(`${system}.${kind}.put`);
        this.sandboxData.set(key(system, kind, record.id), structuredClone(record));
      },
    };
  }

  knowledge() {
    return { search: async () => [{ title: "Refund policy", excerpt: "Refunds are allowed within 14 days of payment." }] };
  }
}
