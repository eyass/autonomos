import "server-only";
import { modeOf } from "@autonomos/schemas";
import { triggerConfigured } from "@autonomos/workflows";
import { activity, audit } from "@/lib/audit";
import { adminDb, HttpError, sessionFor, type Session } from "@/lib/session";
import { createAgent, simulateSandboxTicket, startTestRunWithSample } from "@/server/agents";
import { seedDemoOrganization } from "@/server/demo-seed";
import { defaultAgentConfig } from "@/server/opportunities";

// "Explore a sample workspace": a fictional company with sandbox systems and a Refund Agent.
// Nothing is faked: when the agent runtime is connected, the agent really runs on three
// sample tickets, so Overview, Activity and Approvals fill with real results (one routine
// refund, one that waits for your approval, one prompt-injection attempt that is escalated).
// Runs as a background job; switching to the new workspace is left to the caller, because
// only a request can set the workspace cookie.
export async function createSampleWorkspace(session: Session) {
  // Service client: this runs in a background job, outside the person's request.
  const { data: memberships } = await adminDb().from("organization_members").select("organizations(id, is_demo)").eq("user_id", session.user.id);
  const existing = (memberships ?? []).map((m) => m.organizations as unknown as { id: string; is_demo: boolean } | null).find((o) => o?.is_demo);
  if (existing) return { organizationId: existing.id, created: false, runs: 0 };
  const db = adminDb();
  const { organizationId, opportunityId, processId } = await seedDemoOrganization(db, session.user.id, { name: "Northwind Marketplace (sample)", isDemo: true });
  const demo = await sessionFor(session.user.id, organizationId);
  if (!demo) throw new HttpError(500, "Sample workspace was created but could not be opened");
  await audit(demo, { action: "organization.sample_created" });

  const { config } = await defaultAgentConfig(demo, opportunityId);
  const agentId = await createAgent(demo, { processId, opportunityId, config });
  if (!triggerConfigured()) return { organizationId, created: true, runs: 0 };

  let runs = 0;
  try {
    await startTestRunWithSample(demo, agentId, "routine");
    runs++;
    // Sample workspace only: go live without waiting for the test, so the tickets below run.
    await db.from("agents").update({ status: "active" }).eq("organization_id", organizationId).eq("id", agentId);
    await db.from("automation_opportunities").update({ status: "live" }).eq("organization_id", organizationId).eq("id", opportunityId);
    await activity(demo, { actionType: "agent_activated", title: `${config.name} is live in ${modeOf(config.autonomyLevel).name} mode (sample workspace)`, agentId, processId, status: "success" });
    for (const key of ["routine", "large", "injection"]) {
      const { runIds } = (await simulateSandboxTicket(demo, key)) ?? { runIds: [] };
      runs += runIds.length;
    }
  } catch (e) {
    console.error("sample workspace runs", e);
  }
  return { organizationId, created: true, runs };
}
