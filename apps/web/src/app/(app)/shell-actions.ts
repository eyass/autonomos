"use server";
import { redirect } from "next/navigation";
import { runAction } from "@/lib/actions";
import { adminDb, requireSessionOrThrow } from "@/lib/session";
import { deleteWorkspace, switchWorkspace } from "@/server/platform";
import { createClient } from "@/lib/supabase/server";

export async function markNotificationsRead() {
  return runAction(async () => {
    const session = await requireSessionOrThrow();
    await adminDb().from("notifications").update({ read_at: new Date().toISOString() }).eq("organization_id", session.org.id).is("read_at", null).or(`user_id.is.null,user_id.eq.${session.user.id}`);
  });
}

export async function switchWorkspaceAction(organizationId: string) {
  const result = await runAction(async () => switchWorkspace(await requireSessionOrThrow(), organizationId));
  if (result.ok) redirect("/");
  return result;
}

// Sign-out as a server action: a form inside the account menu is unmounted when the menu
// closes, before the browser submits it, so the old form never reached the server.
export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function deleteWorkspaceAction(confirmName: string) {
  const result = await runAction(async () => deleteWorkspace(await requireSessionOrThrow(), String(confirmName ?? "")));
  if (result.ok) redirect(result.data);
  return result;
}
