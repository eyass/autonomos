import { requireApiSession } from "@/lib/api-auth";
import { handle } from "@/lib/actions";

import { createManualProcess, ManualProcessSchema } from "@/server/processes";

// POST /api/processes
export async function POST(request: Request) {
  return handle(async () => ({ id: await createManualProcess(await requireApiSession(request), ManualProcessSchema.parse(await request.json())) }));
}
