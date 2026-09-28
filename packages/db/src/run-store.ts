import { isPaused } from "./services";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyRunState, type ActionRecord, type ApprovalRecord, type RunContext, type RunState, type RunStore, type StepRecord } from "@autonomos/agents";
import { registerSnapshots, type ConnectionInfo, type KnowledgeSearch, type SandboxRecord, type SandboxStore, type ToolSnapshot } from "@autonomos/integrations";
import type { ModelUsageRecord } from "@autonomos/ai";
import { PolicyConfigSchema, InstructionsSchema, TriggerConfigSchema, type AutonomyLevel } from "@autonomos/schemas";
import type { Database, Json } from "./database.types";
import { sendNotification } from "./notify";

type Client = SupabaseClient<Database>;

function must<T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${what}: not found`);
  return result.data as NonNullable<T>;
}

function check(result: { error: { message: string } | null }, what: string) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
}

// Serialises to JSON-safe values. undefined maps to SQL null (only used for nullable columns).
const json = (v: unknown) => (v === undefined ? null : JSON.parse(JSON.stringify(v))) as NonNullable<Json>;

// Service-role implementation of the run engine's store. RLS is bypassed, so every
// query is filtered by the run's organization_id.
export class SupabaseRunStore implements RunStore {
  constructor(private readonly db: Client) {}

  async loadRun(runId: string): Promise<RunContext | null> {
    const { data: run, error } = await this.db.from("agent_runs").select("*").eq("id", runId).maybeSingle();
    if (error) throw new Error(`load run: ${error.message}`);
    if (!run) return null;
    const org = run.organization_id;
    const [agent, version, tools, process, organization] = await Promise.all([
      this.db.from("agents").select("id, name, status").eq("organization_id", org).eq("id", run.agent_id).single(),
      this.db.from("agent_versions").select("*").eq("organization_id", org).eq("id", run.agent_version_id).single(),
      this.db.from("agent_tools").select("tool_key, definition").eq("organization_id", org).eq("agent_version_id", run.agent_version_id),
      this.db.from("processes").select("id, title, description, department_id, estimated_minutes_per_occurrence").eq("organization_id", org).eq("id", run.process_id).single(),
      this.db.from("organizations").select("id, name, description, industry, agents_paused, agents_paused_until").eq("id", org).single(),
    ]);
    // Composio tools run with the definition stored on this version.
    registerSnapshots(must(tools, "load tools").map((t) => t.definition as unknown as ToolSnapshot | null));
    const a = must(agent, "load agent");
    const v = must(version, "load version");
    const p = must(process, "load process");
    const o = must(organization, "load organization");
    const modelConfig = (v.model_config ?? {}) as { modelClass?: "FAST_MODEL" | "SMART_MODEL" | "AGENT_MODEL" };
    const state = run.state as unknown as RunState;
    return {
      run: {
        id: run.id,
        organizationId: org,
        agentId: run.agent_id,
        agentVersionId: run.agent_version_id,
        processId: run.process_id,
        mode: run.mode,
        status: run.status,
        input: (run.input ?? {}) as Record<string, unknown>,
        state: state && Array.isArray(state.observations) ? state : emptyRunState(),
        inputTokens: run.input_tokens,
        outputTokens: run.output_tokens,
        modelCost: Number(run.model_cost),
        model: run.model,
      },
      agent: a,
      version: {
        id: v.id,
        version: v.version,
        autonomyLevel: v.autonomy_level as AutonomyLevel,
        instructions: InstructionsSchema.parse(v.instructions),
        trigger: TriggerConfigSchema.parse(v.trigger_config),
        policy: PolicyConfigSchema.parse(v.policy_config),
        successCriteria: (v.success_criteria as string[]) ?? [],
        modelClass: modelConfig.modelClass ?? "AGENT_MODEL",
        tools: must(tools, "load tools").map((t) => t.tool_key),
      },
      process: {
        id: p.id,
        title: p.title,
        description: p.description,
        departmentId: p.department_id,
        estimatedMinutesPerOccurrence: p.estimated_minutes_per_occurrence === null ? null : Number(p.estimated_minutes_per_occurrence),
      },
      organization: { id: o.id, name: o.name, description: o.description, industry: o.industry, paused: isPaused(o) },
    };
  }

  async saveRun(ctx: RunContext, patch: Parameters<RunStore["saveRun"]>[1]) {
    const update: Database["public"]["Tables"]["agent_runs"]["Update"] = {
      input_tokens: ctx.run.inputTokens,
      output_tokens: ctx.run.outputTokens,
      model_cost: ctx.run.modelCost,
      execution_cost: ctx.run.modelCost,
    };
    if (patch.status) update.status = patch.status;
    if (patch.state) update.state = json(patch.state);
    if (patch.outcome !== undefined) update.outcome = patch.outcome;
    if (patch.summary !== undefined) update.summary = patch.summary;
    if (patch.output !== undefined) update.output = json(patch.output);
    if (patch.success !== undefined) update.success = patch.success;
    if (patch.error !== undefined) update.error = patch.error;
    if (patch.errorRetryable !== undefined) update.error_retryable = patch.errorRetryable;
    if (patch.startedAt) update.started_at = patch.startedAt.toISOString();
    if (patch.finishedAt) update.finished_at = patch.finishedAt.toISOString();
    if (patch.model) update.model = patch.model;
    if (patch.humanMinutes !== undefined) update.human_minutes = patch.humanMinutes;
    if (patch.baselineMinutes !== undefined) update.baseline_minutes = patch.baselineMinutes;
    if (patch.estimatedMinutesSaved !== undefined) update.estimated_minutes_saved = patch.estimatedMinutesSaved;
    check(await this.db.from("agent_runs").update(update).eq("organization_id", ctx.run.organizationId).eq("id", ctx.run.id), "save run");
  }

  async appendStep(ctx: RunContext, sequence: number, step: StepRecord) {
    // upsert on (run, sequence) keeps step writes idempotent across retries.
    check(
      await this.db.from("agent_run_steps").upsert(
        {
          organization_id: ctx.run.organizationId,
          agent_run_id: ctx.run.id,
          sequence,
          type: step.type,
          description: step.description,
          input: json(step.input),
          output: json(step.output),
          tool: step.tool ?? null,
          model: step.model ?? null,
          duration_ms: step.durationMs ?? null,
          cost: step.cost ?? 0,
          status: step.status,
        },
        { onConflict: "agent_run_id,sequence" },
      ),
      "append step",
    );
  }

  async upsertAction(ctx: RunContext, a: Parameters<RunStore["upsertAction"]>[1]): Promise<ActionRecord> {
    const existing = await this.getActionByKey(ctx, a.idempotencyKey);
    if (existing) return existing;
    const { data, error } = await this.db
      .from("agent_actions")
      .insert({
        organization_id: ctx.run.organizationId,
        agent_id: ctx.run.agentId,
        agent_run_id: ctx.run.id,
        tool: a.tool,
        access: a.access,
        arguments: json(a.args),
        idempotency_key: a.idempotencyKey,
        policy_evaluation: json(a.policy),
      })
      .select("id, status, result")
      .single();
    if (error) {
      // Lost a race with a concurrent retry: the unique key guarantees one row.
      const again = await this.getActionByKey(ctx, a.idempotencyKey);
      if (again) return again;
      throw new Error(`insert action: ${error.message}`);
    }
    return { id: data.id, status: data.status, result: data.result };
  }

  async getActionByKey(ctx: RunContext, key: string): Promise<ActionRecord | null> {
    const { data, error } = await this.db.from("agent_actions").select("id, status, result").eq("organization_id", ctx.run.organizationId).eq("idempotency_key", key).maybeSingle();
    if (error) throw new Error(`get action: ${error.message}`);
    return data ? { id: data.id, status: data.status, result: data.result } : null;
  }

  async finishAction(ctx: RunContext, id: string, patch: Parameters<RunStore["finishAction"]>[2]) {
    check(
      await this.db
        .from("agent_actions")
        .update({
          status: patch.status,
          result: patch.result === undefined ? undefined : json(patch.result),
          error: patch.error,
          approval_request_id: patch.approvalRequestId,
          arguments: patch.args ? json(patch.args) : undefined,
          finished_at: patch.status === "pending" ? null : new Date().toISOString(),
        })
        .eq("organization_id", ctx.run.organizationId)
        .eq("id", id),
      "finish action",
    );
  }

  async countWriteActionsSince(ctx: RunContext, since: Date) {
    const { count, error } = await this.db
      .from("agent_actions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.run.organizationId)
      .eq("agent_id", ctx.run.agentId)
      .eq("access", "write")
      .eq("status", "succeeded")
      .gte("created_at", since.toISOString());
    if (error) throw new Error(`count actions: ${error.message}`);
    return count ?? 0;
  }

  async createApproval(ctx: RunContext, a: Parameters<RunStore["createApproval"]>[1]) {
    const data = must(
      await this.db
        .from("approval_requests")
        .insert({
          organization_id: ctx.run.organizationId,
          agent_id: ctx.run.agentId,
          agent_run_id: ctx.run.id,
          agent_action_id: a.actionId,
          action_type: a.actionType,
          tool: a.tool,
          title: a.title,
          description: a.description,
          proposed_action: json(a.proposedAction),
          modifiable_fields: a.modifiableFields,
          evidence: json(a.evidence),
          policy_checks: json(a.policyChecks),
          reasoning_summary: a.reasoningSummary,
          confidence: a.confidence,
          risk: a.risk,
        })
        .select("id")
        .single(),
      "create approval",
    );
    return { id: data.id };
  }

  async getApproval(ctx: RunContext, id: string): Promise<ApprovalRecord | null> {
    const { data, error } = await this.db.from("approval_requests").select("id, status, decision, comment, resolved_by").eq("organization_id", ctx.run.organizationId).eq("id", id).maybeSingle();
    if (error) throw new Error(`get approval: ${error.message}`);
    if (!data) return null;
    return { id: data.id, status: data.status, decision: data.decision as ApprovalRecord["decision"], comment: data.comment, resolvedBy: data.resolved_by };
  }

  async recordIntervention(ctx: RunContext, i: Parameters<RunStore["recordIntervention"]>[1]) {
    check(
      await this.db.from("human_interventions").insert({
        organization_id: ctx.run.organizationId,
        agent_id: ctx.run.agentId,
        agent_run_id: ctx.run.id,
        approval_request_id: i.approvalId ?? null,
        type: i.type,
        description: i.description,
        minutes_spent: i.minutes,
        user_id: i.userId ?? null,
      }),
      "record intervention",
    );
  }

  async sumInterventionMinutes(ctx: RunContext) {
    const rows = must(await this.db.from("human_interventions").select("minutes_spent").eq("organization_id", ctx.run.organizationId).eq("agent_run_id", ctx.run.id), "sum interventions");
    return rows.reduce((s, r) => s + Number(r.minutes_spent), 0);
  }

  async recordActivity(ctx: RunContext, a: Parameters<RunStore["recordActivity"]>[1]) {
    check(
      await this.db.from("activity_events").insert({
        organization_id: ctx.run.organizationId,
        actor_type: "agent",
        agent_id: ctx.run.agentId,
        agent_run_id: ctx.run.id,
        process_id: ctx.run.processId,
        department_id: ctx.process.departmentId,
        action_type: a.actionType,
        status: a.status,
        title: a.title,
        detail: json({ ...(a.detail ?? {}), mode: ctx.run.mode }),
      }),
      "record activity",
    );
  }

  async recordAudit(ctx: RunContext, a: Parameters<RunStore["recordAudit"]>[1]) {
    check(
      await this.db.from("audit_events").insert({
        organization_id: ctx.run.organizationId,
        actor_type: "agent",
        agent_id: ctx.run.agentId,
        agent_version_id: ctx.run.agentVersionId,
        process_id: ctx.run.processId,
        agent_run_id: ctx.run.id,
        action: a.action,
        system: a.system ?? null,
        tool: a.tool ?? null,
        input: json(a.input),
        output: json(a.output),
        approval_status: a.approvalStatus ?? null,
        result: a.result,
        model: a.model ?? ctx.run.model,
      }),
      "record audit",
    );
  }

  async recordModelUsage(ctx: RunContext, u: ModelUsageRecord) {
    check(
      await this.db.from("model_usage").insert({
        organization_id: ctx.run.organizationId,
        agent_run_id: ctx.run.id,
        purpose: u.purpose,
        model_class: u.modelClass,
        model: u.model,
        input_tokens: u.inputTokens,
        output_tokens: u.outputTokens,
        cached_input_tokens: u.cachedInputTokens,
        estimated_cost: u.estimatedCost,
      }),
      "record model usage",
    );
  }

  async notify(ctx: RunContext, n: Parameters<RunStore["notify"]>[1]) {
    // The link names the event (the approval, or the run), so a retried step notifies once.
    await sendNotification(this.db, ctx.run.organizationId, { ...n, key: `${n.kind}:${n.link}` });
  }

  async isOrganizationPaused(ctx: RunContext) {
    const o = must(await this.db.from("organizations").select("agents_paused, agents_paused_until").eq("id", ctx.run.organizationId).single(), "org paused");
    return isPaused(o);
  }

  async getAgentStatus(ctx: RunContext) {
    const a = must(await this.db.from("agents").select("status").eq("organization_id", ctx.run.organizationId).eq("id", ctx.run.agentId).single(), "agent status");
    return a.status;
  }

  async connectionFor(ctx: RunContext, integration: string): Promise<ConnectionInfo | null> {
    const { data } = await this.db
      .from("integration_connections")
      .select("integration_key, provider, external_account_id, status")
      .eq("organization_id", ctx.run.organizationId)
      .eq("integration_key", integration)
      .eq("status", "connected")
      .maybeSingle();
    return data ? { integration, provider: data.provider, externalAccountId: data.external_account_id } : null;
  }

  sandbox(ctx: RunContext): SandboxStore {
    return sandboxStore(this.db, ctx.run.organizationId);
  }

  knowledge(ctx: RunContext): KnowledgeSearch {
    return knowledgeSearch(this.db, ctx.run.organizationId);
  }
}

export function sandboxStore(db: Client, organizationId: string): SandboxStore {
  return {
    async get(system, kind, id) {
      const { data, error } = await db.from("sandbox_records").select("data").eq("organization_id", organizationId).eq("system", system).eq("kind", kind).eq("external_id", id).maybeSingle();
      if (error) throw new Error(`sandbox get: ${error.message}`);
      return (data?.data as SandboxRecord | undefined) ?? null;
    },
    async list(system, kind) {
      const rows = must(await db.from("sandbox_records").select("data").eq("organization_id", organizationId).eq("system", system).eq("kind", kind).order("created_at"), "sandbox list");
      return rows.map((r) => r.data as SandboxRecord);
    },
    async put(system, kind, record) {
      check(
        await db
          .from("sandbox_records")
          .upsert({ organization_id: organizationId, system, kind, external_id: record.id, data: json(record) }, { onConflict: "organization_id,system,kind,external_id" }),
        "sandbox put",
      );
    },
  };
}

export function knowledgeSearch(db: Client, organizationId: string): KnowledgeSearch {
  return {
    async search(query) {
      const { data, error } = await db.from("documents").select("title, content").eq("organization_id", organizationId).textSearch("search", query, { type: "websearch", config: "english" }).limit(5);
      if (error) throw new Error(`knowledge search: ${error.message}`);
      return (data ?? []).map((d) => ({ title: d.title, excerpt: excerpt(d.content, query) }));
    },
  };
}

function excerpt(content: string, query: string) {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const lower = content.toLowerCase();
  const idx =
    words
      .map((w) => lower.indexOf(w))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0] ?? 0;
  return content.slice(Math.max(0, idx - 200), idx + 600);
}
