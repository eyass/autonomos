import "server-only";
import { CURRENCIES, DEPARTMENTS } from "@autonomos/schemas";
import { cookies } from "next/headers";
import { z } from "zod";
import { activity, audit, track } from "@/lib/audit";
import { draftInitialInventory } from "@/server/processes";
import { createClient } from "@/lib/supabase/server";
import { adminDb, HttpError, isAdmin, ORG_COOKIE, requireRole, type Session } from "@/lib/session";

export const CreateOrgSchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(120),
  website: z.string().trim().max(200).optional().default(""),
  industry: z.string().trim().optional().default(""),
  employeeCount: z.string().trim().optional().default(""),
  country: z.string().trim().max(80).optional().default(""),
  description: z.string().trim().max(2000).optional().default(""),
  // Reviewed during onboarding; drafted from the website when there is one.
  summary: z.string().trim().max(4000).optional().default(""),
  areas: z.array(z.enum(DEPARTMENTS)).optional().default([]),
  currency: z.enum(CURRENCIES).optional(),
  hourlyCost: z.number().positive().max(2000).optional(),
});

// Runs as the user: the SQL function creates organisation, owner membership and audit atomically.
export async function createOrganization(input: z.infer<typeof CreateOrgSchema>) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: input.name,
    p_website: input.website,
    p_industry: input.industry,
    p_employee_count: input.employeeCount,
    p_country: input.country,
    p_description: input.description,
  });
  if (error || !data) throw new HttpError(400, error?.message ?? "Could not create the company");
  const orgId = data as string;
  // The profile step replaces the separate "about" step when summary and areas are known.
  const complete = input.summary.length >= 10 && input.areas.length > 0;
  const db = adminDb();
  await db
    .from("organizations")
    .update({
      company_summary: input.summary || null,
      improvement_areas: input.areas,
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.hourlyCost ? { default_hourly_cost: input.hourlyCost } : {}),
      ...(complete ? { onboarding_step: "connect" } : {}),
    })
    .eq("id", orgId);
  for (const name of input.areas) {
    await db.from("departments").upsert({ organization_id: orgId, name }, { onConflict: "organization_id,name", ignoreDuplicates: true });
  }
  (await cookies()).set(ORG_COOKIE, data, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await track({ user: { id: user.id }, org: { id: data } }, "organization_created", { industry: input.industry, employees: input.employeeCount });
    await track({ user: { id: user.id }, org: { id: data } }, "onboarding_started");
  }
  return { id: orgId, complete };
}

export const AboutSchema = z.object({
  summary: z.string().trim().min(10, "Tell us a little about what the company does").max(4000),
  areas: z.array(z.enum(DEPARTMENTS)).min(1, "Pick at least one area"),
});

export async function saveAbout(session: Session, input: z.infer<typeof AboutSchema>) {
  const db = adminDb();
  await db.from("organizations").update({ company_summary: input.summary, improvement_areas: input.areas, onboarding_step: "connect" }).eq("id", session.org.id);
  for (const name of input.areas) {
    await db.from("departments").upsert({ organization_id: session.org.id, name }, { onConflict: "organization_id,name", ignoreDuplicates: true });
  }
}

export async function completeOnboarding(session: Session) {
  await adminDb().from("organizations").update({ onboarding_step: "done", onboarding_completed_at: new Date().toISOString() }).eq("id", session.org.id);
  await track(session, "onboarding_completed");
  // Draft the first process inventory so the user starts by reviewing, not by typing.
  // A failure here must not block onboarding; discovery stays available by hand.
  try {
    return (await draftInitialInventory(session)).length;
  } catch (e) {
    console.error("initial inventory draft failed", e);
    return 0;
  }
}

export const CompanySettingsSchema = z.object({
  name: z.string().trim().min(1),
  industry: z.string().trim().optional(),
  website: z.string().trim().optional(),
  employeeCount: z.string().trim().optional(),
  summary: z.string().trim().max(4000).optional(),
  defaultHourlyCost: z.number().positive().max(10000),
});

export async function updateCompany(session: Session, input: z.infer<typeof CompanySettingsSchema>) {
  requireRole(session, ["owner", "admin"]);
  const { error } = await adminDb()
    .from("organizations")
    .update({
      name: input.name,
      industry: input.industry || null,
      website: input.website || null,
      employee_count: input.employeeCount || null,
      default_hourly_cost: input.defaultHourlyCost,
      ...(input.summary !== undefined ? { company_summary: input.summary || null } : {}),
    })
    .eq("id", session.org.id);
  if (error) throw new Error(`update company: ${error.message}`);
  await audit(session, { action: "organization.updated", input });
}

export async function upsertDepartment(session: Session, input: { id?: string; name: string; hourlyLabourCost: number | null }) {
  requireRole(session, ["owner", "admin"]);
  const db = adminDb();
  if (input.id) {
    await db.from("departments").update({ name: input.name, hourly_labour_cost: input.hourlyLabourCost }).eq("organization_id", session.org.id).eq("id", input.id);
  } else {
    await db.from("departments").insert({ organization_id: session.org.id, name: input.name, hourly_labour_cost: input.hourlyLabourCost });
  }
  await audit(session, { action: "department.saved", input });
}

export async function archiveDepartment(session: Session, id: string) {
  requireRole(session, ["owner", "admin"]);
  await adminDb().from("departments").update({ archived_at: new Date().toISOString() }).eq("organization_id", session.org.id).eq("id", id);
  await audit(session, { action: "department.archived", input: { id } });
}

export async function inviteMember(session: Session, email: string, role: "admin" | "member") {
  requireRole(session, ["owner", "admin"]);
  const clean = z.string().email().parse(email.trim().toLowerCase());
  await adminDb().from("organization_invites").upsert({ organization_id: session.org.id, email: clean, role, invited_by: session.user.id, accepted_at: null }, { onConflict: "organization_id,email" });
  await audit(session, { action: "member.invited", input: { email: clean, role } });
}

export async function removeMember(session: Session, userId: string) {
  requireRole(session, ["owner", "admin"]);
  if (userId === session.user.id) throw new HttpError(400, "You cannot remove yourself");
  const db = adminDb();
  const { data: target } = await db.from("organization_members").select("role").eq("organization_id", session.org.id).eq("user_id", userId).maybeSingle();
  if (!target) throw new HttpError(404, "Member not found");
  if (target.role === "owner") throw new HttpError(403, "The owner cannot be removed");
  await db.from("organization_members").delete().eq("organization_id", session.org.id).eq("user_id", userId);
  await audit(session, { action: "member.removed", input: { userId } });
}

export async function setMemberApproval(session: Session, userId: string, canApprove: boolean) {
  requireRole(session, ["owner", "admin"]);
  await adminDb().from("organization_members").update({ can_approve: canApprove }).eq("organization_id", session.org.id).eq("user_id", userId);
  await audit(session, { action: "member.approval_permission", input: { userId, canApprove } });
}

// Emergency stop (PRD section 91). Runs check this flag before every external write.
// `until` time-boxes the pause; null means until an admin resumes.
export async function setAgentsPaused(session: Session, paused: boolean, until: string | null = null) {
  if (!isAdmin(session)) throw new HttpError(403, "Only admins can pause all agents");
  if (until && new Date(until) <= new Date()) throw new HttpError(400, "Choose a time in the future");
  await adminDb()
    .from("organizations")
    .update({
      agents_paused: paused,
      agents_paused_at: paused ? new Date().toISOString() : null,
      agents_paused_by: paused ? session.user.id : null,
      agents_paused_until: paused ? until : null,
    })
    .eq("id", session.org.id);
  await audit(session, { action: paused ? "organization.agents_paused" : "organization.agents_resumed", input: { until } });
  await activity(session, {
    actionType: paused ? "emergency_pause" : "emergency_resume",
    title: paused ? (until ? `All agents paused until ${new Date(until).toUTCString().slice(0, 22)} UTC` : "All agents paused until an admin resumes them") : "Agents resumed",
    status: paused ? "warning" : "success",
  });
}

export async function revokeInvite(session: Session, email: string) {
  requireRole(session, ["owner", "admin"]);
  await adminDb().from("organization_invites").delete().eq("organization_id", session.org.id).eq("email", email.trim().toLowerCase()).is("accepted_at", null);
  await audit(session, { action: "member.invite_revoked", input: { email } });
}

export async function setMemberRole(session: Session, userId: string, role: "admin" | "member") {
  requireRole(session, ["owner", "admin"]);
  const db = adminDb();
  const { data: target } = await db.from("organization_members").select("role").eq("organization_id", session.org.id).eq("user_id", userId).maybeSingle();
  if (!target) throw new HttpError(404, "Member not found");
  if (target.role === "owner") throw new HttpError(403, "The owner's role cannot be changed");
  await db.from("organization_members").update({ role }).eq("organization_id", session.org.id).eq("user_id", userId);
  await audit(session, { action: "member.role_changed", input: { userId, role } });
}

export const ProfileSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name").max(80),
  lastName: z.string().trim().min(1, "Enter your last name").max(80),
  approvals: z.boolean(),
  failures: z.boolean(),
  weeklySummary: z.boolean(),
});

export async function updateProfile(session: Session, input: z.infer<typeof ProfileSchema>) {
  const db = adminDb();
  await db.from("users").update({ first_name: input.firstName, last_name: input.lastName }).eq("id", session.user.id);
  await db
    .from("organization_members")
    .update({ notification_preferences: { approvals: input.approvals, failures: input.failures, weekly_summary: input.weeklySummary } })
    .eq("organization_id", session.org.id)
    .eq("user_id", session.user.id);
}
