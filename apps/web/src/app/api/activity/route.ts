import { requireApiSession } from "@/lib/api-auth";
import { handle } from "@/lib/actions";
import { adminDb } from "@/lib/session";

// GET /api/activity?limit=50: what AutonomOS and its agents did, newest first.
export async function GET(request: Request) {
  return handle(async () => {
    const session = await requireApiSession(request);
    const limit = Math.min(200, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 50));
    const { data } = await adminDb()
      .from("activity_events")
      .select("id, occurred_at, actor_type, action_type, title, status, agent_id, agent_run_id, process_id")
      .eq("organization_id", session.org.id)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    return data ?? [];
  });
}
