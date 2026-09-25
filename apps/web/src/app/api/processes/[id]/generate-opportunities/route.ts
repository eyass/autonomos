import { handle } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { requireSessionOrThrow } from "@/lib/session";
import { generateOpportunitiesForProcess } from "@/server/opportunities";

// POST /api/processes/:id/generate-opportunities
export async function POST(_: Request, ctx: RouteContext<"/api/processes/[id]/generate-opportunities">) {
  return handle(async () => {
    const session = await requireSessionOrThrow();
    rateLimit(`ai:${session.user.id}`, 30, 60_000);
    return { opportunityIds: await generateOpportunitiesForProcess(session, (await ctx.params).id) };
  });
}
