import { policyForTools } from "@autonomos/agents";
import type { AgentConfig } from "@autonomos/schemas";
import { redirect } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/session";
import { draftAgentForOpportunity } from "@/server/opportunities";
import { toolOptions } from "../tool-options";
import { NewAgentWizard } from "./wizard";

export const metadata = { title: "Create agent" };

export default async function NewAgentPage({ searchParams }: { searchParams: Promise<{ opportunity?: string }> }) {
  const session = await requireSession();
  const { opportunity } = await searchParams;
  if (!opportunity) redirect("/opportunities");
  const { opportunity: o, draft, connected } = await draftAgentForOpportunity(session, opportunity);
  // Start one level below the target for anything involving money; the user can raise it.
  const level = Math.min(o.target_autonomy_level, draft.suggestedTools.includes("stripe.create_refund") ? 3 : o.target_autonomy_level, 4) as AgentConfig["autonomyLevel"];
  const initial: AgentConfig = {
    name: draft.name,
    description: o.description,
    autonomyLevel: Math.max(level, 2) as AgentConfig["autonomyLevel"],
    instructions: draft.instructions,
    trigger: draft.suggestedTrigger,
    tools: draft.suggestedTools,
    policy: policyForTools(draft.suggestedTools, Math.max(level, 2)),
    successCriteria: draft.successCriteria,
    modelConfig: { modelClass: "AGENT_MODEL" },
  };
  return (
    <>
      <PageHeader back={{ href: `/opportunities/${o.id}`, label: o.title }} title="Create agent" description={`From the opportunity "${o.title}". Everything is pre-filled; check each step.`} />
      {!connected.length ? <Notice tone="warn" className="mb-4">No integrations are connected, so the agent has nothing it can act on yet.</Notice> : null}
      <NewAgentWizard initial={initial} tools={toolOptions(connected)} processId={o.process_id} opportunityId={o.id} />
    </>
  );
}
