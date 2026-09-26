import "server-only";
import { triggerConfigured } from "@autonomos/workflows";
import { activity, audit } from "@/lib/audit";
import { adminDb, HttpError, sessionFor, type Session } from "@/lib/session";
import { createAgent, simulateSandboxTicket, startTestRunWithSample } from "@/server/agents";
import { seedDemoOrganization } from "@/server/demo-seed";
import { defaultAgentConfig } from "@/server/opportunities";
import { listWorkspaces, switchWorkspace } from "@/server/platform";

// "Explore a sample workspace": a fictional company with sandbox systems and a Refund Agent.
// Nothing is faked: when the agent runtime is connected, the agent really runs on three
// sample tickets, so Overview, Activity and Approvals fill with real results (one routine
// refund, one that waits for your approval, one prompt-injection attempt that is escalated).
export async function createSampleWorkspace(session: Session) {
  const existing = (await listWorkspaces(session)).find((w) => w.is_demo);
  if (existing) {
    await switchWorkspace(session, existing.id);
    return { organizationId: existing.id, created: false, runs: 0 };
  }
  const db = adminDb();
  const { organizationId, opportunityId, processId } = await seedDemoOrganization(db, session.user.id, { name: "Northwind Marketplace (sample)", isDemo: true });
  await switchWorkspace(session, organizationId);
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
    await activity(demo, { actionType: "agent_activated", title: `${config.name} is live at L${config.autonomyLevel} (sample workspace)`, agentId, processId, status: "success" });
    for (const key of ["routine", "large", "injection"]) {
      const { runIds } = (await simulateSandboxTicket(demo, key)) ?? { runIds: [] };
      runs += runIds.length;
    }
  } catch (e) {
    console.error("sample workspace runs", e);
  }
  return { organizationId, created: true, runs };
}
