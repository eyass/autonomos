import "server-only";
import type { AnalyticsEvent } from "@autonomos/schemas";
import { PostHog } from "posthog-node";
import { adminDb, type Session } from "./session";

// Append-only audit log (PRD section 70).
export async function audit(
  session: Session,
  entry: { action: string; agentId?: string; agentVersionId?: string; processId?: string; agentRunId?: string; input?: unknown; output?: unknown; result?: string; system?: string; tool?: string; approvalStatus?: string },
) {
  const { error } = await adminDb()
    .from("audit_events")
    .insert({
      organization_id: session.org.id,
      actor_type: "user",
      actor_user_id: session.user.id,
      action: entry.action,
      agent_id: entry.agentId ?? null,
      agent_version_id: entry.agentVersionId ?? null,
      process_id: entry.processId ?? null,
      agent_run_id: entry.agentRunId ?? null,
      input: (entry.input ?? null) as never,
      output: (entry.output ?? null) as never,
      result: entry.result ?? "success",
      system: entry.system ?? null,
      tool: entry.tool ?? null,
      approval_status: entry.approvalStatus ?? null,
    });
  if (error) throw new Error(`audit: ${error.message}`);
}

export async function activity(
  session: Session,
  entry: { actionType: string; title: string; status?: string; agentId?: string; agentRunId?: string; processId?: string; departmentId?: string | null; detail?: Record<string, unknown> },
) {
  await adminDb()
    .from("activity_events")
    .insert({
      organization_id: session.org.id,
      actor_type: "user",
      actor_user_id: session.user.id,
      action_type: entry.actionType,
      title: entry.title,
      status: entry.status ?? "info",
      agent_id: entry.agentId ?? null,
      agent_run_id: entry.agentRunId ?? null,
      process_id: entry.processId ?? null,
      department_id: entry.departmentId ?? null,
      detail: (entry.detail ?? {}) as never,
    });
}

let posthog: PostHog | null = null;

// Product analytics (PRD section 94). No-op without POSTHOG_KEY.
export async function track(session: Pick<Session, "user" | "org"> | { user: { id: string }; org?: { id: string } }, event: AnalyticsEvent, properties: Record<string, unknown> = {}) {
  if (!process.env.POSTHOG_KEY) return;
  posthog ??= new PostHog(process.env.POSTHOG_KEY, { host: process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com", flushAt: 1, flushInterval: 0 });
  posthog.capture({
    distinctId: session.user.id,
    event,
    properties: { ...properties, organization_id: session.org?.id },
    groups: session.org ? { organization: session.org.id } : undefined,
  });
  await posthog.flush();
}

export async function recordUsage(organizationId: string, usage: { purpose: string; modelClass: string; model: string; inputTokens: number; outputTokens: number; cachedInputTokens: number; estimatedCost: number }) {
  await adminDb().from("model_usage").insert({
    organization_id: organizationId,
    purpose: usage.purpose,
    model_class: usage.modelClass,
    model: usage.model,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cached_input_tokens: usage.cachedInputTokens,
    estimated_cost: usage.estimatedCost,
  });
}
