import { requireApiSession } from "@/lib/api-auth";
import { policyForTools } from "@autonomos/agents";
import { AgentConfigSchema } from "@autonomos/schemas";
import { handle } from "@/lib/actions";

import { createAgent } from "@/server/agents";
import { draftAgentForOpportunity } from "@/server/opportunities";

// POST /api/opportunities/:id/create-agent
// Body: { config?: AgentConfig }. Without a config the AI-drafted configuration is used, starting at L3.
export async function POST(request: Request, ctx: RouteContext<"/api/opportunities/[id]/create-agent">) {
  return handle(async () => {
    const session = await requireApiSession(request);
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { config?: unknown };
    const { opportunity, draft } = await draftAgentForOpportunity(session, id);
    const config = body.config
      ? AgentConfigSchema.parse(body.config)
      : AgentConfigSchema.parse({
          name: draft.name,
          description: opportunity.description,
          autonomyLevel: 3,
          instructions: draft.instructions,
          trigger: draft.suggestedTrigger,
          tools: draft.suggestedTools,
          policy: policyForTools(draft.suggestedTools, 3),
          successCriteria: draft.successCriteria,
        });
    return { agentId: await createAgent(session, { processId: opportunity.process_id, opportunityId: id, config }) };
  });
}
