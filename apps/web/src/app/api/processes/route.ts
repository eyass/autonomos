import { handle } from "@/lib/actions";
import { requireSessionOrThrow } from "@/lib/session";
import { createManualProcess, ManualProcessSchema } from "@/server/processes";

// POST /api/processes
export async function POST(request: Request) {
  return handle(async () => ({ id: await createManualProcess(await requireSessionOrThrow(), ManualProcessSchema.parse(await request.json())) }));
}
