"use server";
import { runAction } from "@/lib/actions";
import { adminDb, requireSessionOrThrow } from "@/lib/session";

export async function markNotificationsRead() {
  return runAction(async () => {
    const session = await requireSessionOrThrow();
    await adminDb()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("organization_id", session.org.id)
      .is("read_at", null)
      .or(`user_id.is.null,user_id.eq.${session.user.id}`);
  });
}
