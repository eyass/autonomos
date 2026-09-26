import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import type { Database } from "./database.types";

export type NotificationInput = {
  kind: "approval_required" | "agent_failed" | "agent_escalation";
  title: string;
  body: string;
  link: string;
};

// In-app notification for the organisation plus email for approvals, failures and
// escalations (PRD section 73). Email is sent only when RESEND_API_KEY and EMAIL_FROM are set.
export async function sendNotification(db: SupabaseClient<Database>, organizationId: string, n: NotificationInput) {
  const { error } = await db.from("notifications").insert({
    organization_id: organizationId,
    user_id: null,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
  });
  if (error) throw new Error(`notification: ${error.message}`);

  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return;

  let query = db.from("organization_members").select("role, can_approve, notification_preferences, users(email)").eq("organization_id", organizationId);
  if (n.kind === "approval_required") query = query.eq("can_approve", true);
  else query = query.in("role", ["owner", "admin"]);
  const { data: members } = await query;
  // Each member chooses which emails they get; in-app notifications always appear.
  const pref = n.kind === "approval_required" ? "approvals" : "failures";
  const to = (members ?? [])
    .filter((m) => (m.notification_preferences as Record<string, boolean> | null)?.[pref] !== false)
    .map((m) => (m.users as unknown as { email?: string } | null)?.email)
    .filter((e): e is string => Boolean(e));
  if (!to.length) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject: n.title,
      text: `${n.body}\n\nOpen in AutonomOS: ${appUrl}${n.link}`,
    });
  } catch (e) {
    // Email is best effort; the in-app notification is the record.
    console.error("email notification failed", e);
  }
}
