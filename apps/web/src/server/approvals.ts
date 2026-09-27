import "server-only";
import { applyApprovalChanges, INTERVENTION_MINUTES } from "@autonomos/agents";
import { getTool, ToolError } from "@autonomos/integrations";
import { sendNotification } from "@autonomos/db";
import { ApprovalDecisionSchema, type ApprovalDecision } from "@autonomos/schemas";
import { enqueueRun, TriggerNotConfiguredError } from "@autonomos/workflows";
import { activity, audit, track } from "@/lib/audit";
import { adminDb, HttpError, type Session } from "@/lib/session";

// Resolves an approval and resumes the run (PRD section 44). The status transition is a
// conditional update on status = 'pending', so two people approving at once cannot both win.
export async function resolveApproval(session: Session, approvalId: string, raw: ApprovalDecision) {
  if (!session.canApprove) throw new HttpError(403, "You are not allowed to approve agent actions");
  const decision = ApprovalDecisionSchema.parse(raw);
  const db = adminDb();
  const { data: approval } = await db.from("approval_requests").select("*, agents(name, process_id)").eq("organization_id", session.org.id).eq("id", approvalId).maybeSingle();
  if (!approval) throw new HttpError(404, "Approval not found");
  if (approval.status !== "pending") throw new HttpError(409, `This approval was already ${approval.status}`);

  let changes: Record<string, unknown> | undefined;
  if (decision.decision === "modify") {
    try {
      const merged = applyApprovalChanges(approval.tool, approval.proposed_action as Record<string, unknown>, decision.changes);
      changes = Object.fromEntries(Object.keys(decision.changes).map((k) => [k, merged[k]]));
    } catch (e) {
      throw new HttpError(400, e instanceof ToolError ? e.message : "Invalid modification");
    }
  }

  // Approval limits: a member may only approve amounts up to their personal limit.
  if (decision.decision !== "reject" && session.approvalLimit !== null) {
    const field = getTool(approval.tool)?.amountField;
    const amount = field ? Number({ ...(approval.proposed_action as Record<string, unknown>), ...(changes ?? {}) }[field]) : NaN;
    if (Number.isFinite(amount) && amount > session.approvalLimit) {
      throw new HttpError(403, `This is above your approval limit of ${session.approvalLimit} ${session.org.currency}. Ask someone with a higher limit, or reduce the amount.`);
    }
  }

  const status = decision.decision === "approve" ? "approved" : decision.decision === "reject" ? "rejected" : "modified";
  const { data: updated, error } = await db
    .from("approval_requests")
    .update({
      status,
      resolved_at: new Date().toISOString(),
      resolved_by: session.user.id,
      decision: { decision: decision.decision, ...(changes ? { changes } : {}) } as never,
      comment: decision.comment ?? null,
    })
    .eq("organization_id", session.org.id)
    .eq("id", approvalId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) throw new HttpError(409, "This approval was resolved by someone else");

  const agent = approval.agents as unknown as { name: string; process_id: string } | null;
  await db.from("human_interventions").insert({
    organization_id: session.org.id,
    agent_id: approval.agent_id,
    agent_run_id: approval.agent_run_id,
    approval_request_id: approvalId,
    type: status === "modified" ? "correction" : "approval",
    description: `${status === "modified" ? "Modified and approved" : status === "approved" ? "Approved" : "Rejected"}: ${approval.title}`,
    minutes_spent: status === "modified" ? INTERVENTION_MINUTES.modified : status === "approved" ? INTERVENTION_MINUTES.approval : INTERVENTION_MINUTES.rejected,
    user_id: session.user.id,
  });
  await audit(session, {
    action: `approval.${status}`,
    agentId: approval.agent_id,
    agentRunId: approval.agent_run_id,
    processId: agent?.process_id,
    tool: approval.tool,
    input: approval.proposed_action,
    output: { changes, comment: decision.comment },
    approvalStatus: status,
  });
  await activity(session, {
    actionType: `approval_${status}`,
    title: `${session.user.firstName || session.user.email} ${status === "modified" ? "changed and approved" : status}: ${approval.title}`,
    agentId: approval.agent_id,
    agentRunId: approval.agent_run_id,
    processId: agent?.process_id,
    status: status === "rejected" ? "warning" : "success",
  });
  await track(session, status === "rejected" ? "approval_rejected" : "approval_approved", { approval_id: approvalId, modified: status === "modified" });
  if (status === "modified") await track(session, "human_override", { approval_id: approvalId });

  try {
    await enqueueRun(approval.agent_run_id, `resume-${approvalId}`);
  } catch (e) {
    // The decision is saved either way; say so, and leave a trace in Activity.
    await activity(session, {
      actionType: "run_resume_failed",
      title: `Decision saved, but the run could not resume: ${e instanceof Error ? e.message : String(e)}`,
      agentId: approval.agent_id,
      agentRunId: approval.agent_run_id,
      status: "error",
    });
    await sendNotification(adminDb(), session.org.id, {
      kind: "agent_failed",
      title: "An approved run could not resume",
      body: `The decision on "${approval.title}" was saved, but the run did not continue. Open it to start it again.`,
      link: `/activity/${approval.agent_run_id}`,
      key: `resume_failed:${approvalId}`,
    }).catch((err) => console.error("notification failed", err));
    if (e instanceof TriggerNotConfiguredError) throw new HttpError(503, `${e.message} The decision was saved; the run resumes once the agent runtime is connected.`);
    throw e;
  }
  return { status };
}
