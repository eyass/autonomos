import "server-only";
import { SAMPLE_TICKETS } from "@autonomos/integrations";
import { z } from "zod";
import { adminDb, HttpError, type Session } from "@/lib/session";
import { createAgent, startTestRun, startTestRunWithSample } from "@/server/agents";
import { analyseWebsite, refreshWebsiteProfile } from "@/server/company-profile";
import { createSampleWorkspace } from "@/server/demo";
import type { JobKind } from "@/server/jobs";
import { defaultAgentConfig, generateOpportunitiesForProcess } from "@/server/opportunities";
import { DocumentImportSchema, importDocument, setProcessStatus } from "@/server/processes";

// What each background job does. Each one can run a second time after its server stopped
// part way, so each is safe to repeat: work already done is found and reused, not redone.

type Context = { userId: string; email: string; session: Session | null; input: Record<string, unknown>; attempt: number };
type Result = Record<string, unknown> & { href?: string };

const needSession = (ctx: Context) => {
  if (!ctx.session) throw new HttpError(401, "Not signed in to a workspace");
  return ctx.session;
};

export const HANDLERS: Record<JobKind, (ctx: Context) => Promise<Result>> = {
  // Onboarding, before there is a workspace: the result fills in the company form.
  website_profile: async (ctx) => {
    const { website } = z.object({ website: z.string().min(1) }).parse(ctx.input);
    return { analysis: await analyseWebsite({ website, email: ctx.email }) };
  },

  profile_refresh: async (ctx) => {
    const analysis = await refreshWebsiteProfile(needSession(ctx));
    return { pages: analysis.pagesRead.length, tools: analysis.detectedTools.map((t) => t.name) };
  },

  document_import: async (ctx) => {
    const r = await importDocument(needSession(ctx), DocumentImportSchema.parse(ctx.input));
    return { ...r, href: `/processes?status=draft&drafted=${r.processIds.length}` };
  },

  // Approving a process (optional) and finding its automation ideas.
  opportunities: async (ctx) => {
    const session = needSession(ctx);
    const { processId, approve } = z.object({ processId: z.string().uuid(), approve: z.boolean().default(false) }).parse(ctx.input);
    if (approve) await setProcessStatus(session, processId, "reviewed");
    let ids: string[];
    try {
      ids = await generateOpportunitiesForProcess(session, processId);
    } catch (e) {
      // An approval stands even when the analysis fails; say what happened on the process.
      if (!approve) throw e;
      console.error("opportunity generation after approval failed", e);
      return { ids: [], href: `/processes/${processId}?ideas=failed` };
    }
    if (!ids.length) {
      const { data } = await adminDb().from("automation_opportunities").select("id").eq("organization_id", session.org.id).eq("process_id", processId).limit(2);
      if (data?.length === 1) return { ids: [], href: `/opportunities/${data[0]!.id}` };
      return { ids: [], href: data?.length ? `/opportunities?process=${processId}` : `/processes/${processId}?ideas=none` };
    }
    return { ids, href: ids.length === 1 ? `/opportunities/${ids[0]}?found=1` : `/opportunities?process=${processId}` };
  },

  // One click from an idea to a tested agent. A second run reuses the agent and its test.
  build_agent: async (ctx) => {
    const session = needSession(ctx);
    const { opportunityId } = z.object({ opportunityId: z.string().uuid() }).parse(ctx.input);
    const db = adminDb();
    const { data: had } = await db.from("agents").select("id").eq("organization_id", session.org.id).eq("opportunity_id", opportunityId).maybeSingle();
    let agentId = had?.id ?? null;
    if (agentId) {
      const { data: test } = await db
        .from("agent_runs")
        .select("id")
        .eq("organization_id", session.org.id)
        .eq("agent_id", agentId)
        .eq("mode", "test")
        .order("queued_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (test) return { agentId, runId: test.id, href: `/activity/${test.id}?built=1` };
    }
    const { opportunity, config } = await defaultAgentConfig(session, opportunityId);
    if (!config.tools.length) throw new HttpError(409, "Connect the systems this agent needs first");
    agentId ??= await createAgent(session, { processId: opportunity.process_id, opportunityId: opportunity.id, config });
    const runId = config.tools.includes("zendesk.read_ticket") ? await startTestRunWithSample(session, agentId, SAMPLE_TICKETS[0]!.key) : await startTestRun(session, agentId, {});
    return { agentId, runId, href: `/activity/${runId}?built=1` };
  },

  // Switching to the new workspace needs the person's request (it sets a cookie), so the
  // result points at the route that does it.
  sample_workspace: async (ctx) => {
    const r = await createSampleWorkspace(needSession(ctx));
    return { ...r, href: `/api/workspaces/switch?to=${r.organizationId}` };
  },
};
