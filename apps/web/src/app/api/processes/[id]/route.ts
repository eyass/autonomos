import { z } from "zod";
import { handle } from "@/lib/actions";
import { requireSessionOrThrow } from "@/lib/session";
import { ProcessUpdateSchema, setProcessStatus, updateProcess } from "@/server/processes";

const Patch = ProcessUpdateSchema.partial().extend({ status: z.enum(["draft", "reviewed", "active", "archived"]).optional() });

// PATCH /api/processes/:id  (full update, and/or a status change)
export async function PATCH(request: Request, ctx: RouteContext<"/api/processes/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const session = await requireSessionOrThrow();
    const { status, ...rest } = Patch.parse(await request.json());
    if (Object.keys(rest).length) await updateProcess(session, id, ProcessUpdateSchema.parse(rest));
    if (status) await setProcessStatus(session, id, status);
    return { id };
  });
}
