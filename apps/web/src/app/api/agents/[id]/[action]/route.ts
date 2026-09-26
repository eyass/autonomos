import { requireApiSession } from "@/lib/api-auth";
import { z } from "zod";
import { handle } from "@/lib/actions";
import { HttpError } from "@/lib/session";
import { activateAgent, pauseAgent, startProductionRun, startTestRun } from "@/server/agents";

const Input = z.object({ input: z.record(z.string(), z.unknown()).default({}) });

// POST /api/agents/:id/test | activate | pause | run
export async function POST(request: Request, ctx: RouteContext<"/api/agents/[id]/[action]">) {
  return handle(async () => {
    const session = await requireApiSession(request);
    const { id, action } = await ctx.params;
    switch (action) {
      case "test":
        return { runId: await startTestRun(session, id, Input.parse(await request.json().catch(() => ({}))).input) };
      case "run":
        return { runId: await startProductionRun(session, id, Input.parse(await request.json().catch(() => ({}))).input) };
      case "activate":
        await activateAgent(session, id);
        return { status: "active" };
      case "pause":
        await pauseAgent(session, id);
        return { status: "paused" };
      default:
        throw new HttpError(404, "Unknown action");
    }
  });
}
