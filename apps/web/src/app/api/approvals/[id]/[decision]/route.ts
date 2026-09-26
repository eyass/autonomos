import { requireApiSession } from "@/lib/api-auth";
import { z } from "zod";
import { handle } from "@/lib/actions";
import { HttpError } from "@/lib/session";
import { resolveApproval } from "@/server/approvals";

const Body = z.object({ comment: z.string().max(2000).optional(), changes: z.record(z.string(), z.unknown()).optional() });

// POST /api/approvals/:id/approve | reject | modify
export async function POST(request: Request, ctx: RouteContext<"/api/approvals/[id]/[decision]">) {
  return handle(async () => {
    const session = await requireApiSession(request);
    const { id, decision } = await ctx.params;
    const body = Body.parse(await request.json().catch(() => ({})));
    if (decision === "approve") return resolveApproval(session, id, { decision: "approve", comment: body.comment });
    if (decision === "reject") return resolveApproval(session, id, { decision: "reject", comment: body.comment });
    if (decision === "modify") {
      if (!body.changes) throw new HttpError(400, "changes are required");
      return resolveApproval(session, id, { decision: "modify", changes: body.changes, comment: body.comment });
    }
    throw new HttpError(404, "Unknown decision");
  });
}
