import { requireApiSession } from "@/lib/api-auth";
import { handle } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";

import { generateOpportunitiesForProcess } from "@/server/opportunities";

// POST /api/processes/:id/generate-opportunities
export async function POST(request: Request, ctx: RouteContext<"/api/processes/[id]/generate-opportunities">) {
  return handle(async () => {
    const session = await requireApiSession(request);
    rateLimit(`ai:${session.user.id}`, 30, 60_000);
    return { opportunityIds: await generateOpportunitiesForProcess(session, (await ctx.params).id) };
  });
}
