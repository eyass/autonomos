import { requireApiSession } from "@/lib/api-auth";
import { handle } from "@/lib/actions";
import { adminDb } from "@/lib/session";

// GET /api/agents: the organisation's agents with status and autonomy level.
export async function GET(request: Request) {
  return handle(async () => {
    const session = await requireApiSession(request);
    const { data } = await adminDb()
      .from("agents")
      .select("id, name, status, autonomy_level, process_id, opportunity_id, created_at, updated_at")
      .eq("organization_id", session.org.id)
      .order("created_at", { ascending: false });
    return data ?? [];
  });
}
