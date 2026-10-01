import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createServiceClient, isPaused, type Database } from "@autonomos/db";
import { normalizeIndustry, type CompanyProfile } from "@autonomos/schemas";
import { createClient } from "./supabase/server";

export const ORG_COOKIE = "aos_org";

export type Role = "owner" | "admin" | "member";

// The profile drafted from the website, plus which pages it was read from.
export type WebsiteProfile = CompanyProfile & { pagesRead?: Array<{ url: string; kind: string; title: string }>; otherTechnology?: string[] };

export type Session = {
  user: { id: string; email: string; firstName: string; lastName: string };
  org: {
    id: string;
    name: string;
    industry: string | null;
    website: string | null;
    employeeCount: string | null;
    country: string | null;
    description: string | null;
    companySummary: string | null;
    improvementAreas: string[];
    currency: string;
    defaultHourlyCost: number;
    agentsPaused: boolean;
    agentsPausedUntil: string | null;
    onboardingStep: string;
    detectedTools: string[];
    websiteProfile: WebsiteProfile | null;
    onboardingCompletedAt: string | null;
    isDemo: boolean;
    plan: string;
  };
  role: Role;
  canApprove: boolean;
  // Largest amount this member may approve; null means no limit.
  approvalLimit: number | null;
  // Set when the request is authenticated with an API key rather than a browser session.
  apiKeyId?: string;
};

type OrgRow = Database["public"]["Tables"]["organizations"]["Row"];
type MemberRow = { role: Role; can_approve: boolean; approval_limit: number | null };

export function toSession(user: { id: string; email: string }, profile: { first_name: string; last_name: string; email: string } | null, org: OrgRow, membership: MemberRow): Session {
  return {
    user: { id: user.id, email: profile?.email ?? user.email ?? "", firstName: profile?.first_name ?? "", lastName: profile?.last_name ?? "" },
    org: {
      id: org.id,
      name: org.name,
      industry: normalizeIndustry(org.industry),
      website: org.website,
      employeeCount: org.employee_count,
      country: org.country,
      description: org.description,
      companySummary: org.company_summary,
      improvementAreas: org.improvement_areas,
      currency: org.currency,
      defaultHourlyCost: Number(org.default_hourly_cost),
      // A time-boxed pause whose end has passed is no longer in force.
      agentsPaused: isPaused(org),
      agentsPausedUntil: isPaused(org) ? org.agents_paused_until : null,
      onboardingStep: org.onboarding_step,
      detectedTools: org.detected_tools ?? [],
      websiteProfile: (org.website_profile as WebsiteProfile | null) ?? null,
      onboardingCompletedAt: org.onboarding_completed_at,
      isDemo: org.is_demo,
      plan: org.plan,
    },
    role: membership.role,
    canApprove: membership.can_approve,
    approvalLimit: membership.approval_limit === null ? null : Number(membership.approval_limit),
  };
}

// Builds a session for a known member with the service client (API keys, a workspace just created).
export async function sessionFor(userId: string, organizationId: string): Promise<Session | null> {
  const db = createServiceClient();
  const [{ data: membership }, { data: org }, { data: profile }] = await Promise.all([
    db.from("organization_members").select("role, can_approve, approval_limit").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
    db.from("organizations").select("*").eq("id", organizationId).maybeSingle(),
    db.from("users").select("first_name, last_name, email").eq("id", userId).maybeSingle(),
  ]);
  if (!membership || !org || !profile) return null;
  return toSession({ id: userId, email: profile.email }, profile, org, membership);
}

export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

// Resolves the signed-in user and their current organisation. Membership is read with the
// user's own client, so RLS guarantees the user belongs to the organisation.
export const getSession = cache(async (): Promise<Session | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: memberships } = await supabase.from("organization_members").select("organization_id, role, can_approve, approval_limit, created_at").eq("user_id", user.id).order("created_at");
  let rows = memberships ?? [];
  if (!rows.length) {
    // First sign-in of an invited user: claim pending invites, then look again.
    const { data: accepted } = await supabase.rpc("accept_pending_invites");
    if (accepted) {
      const again = await supabase.from("organization_members").select("organization_id, role, can_approve, approval_limit, created_at").eq("user_id", user.id).order("created_at");
      rows = again.data ?? [];
    }
  }
  if (!rows.length) return null;
  const preferred = (await cookies()).get(ORG_COOKIE)?.value;
  const membership = rows.find((m) => m.organization_id === preferred) ?? rows[0]!;
  const [{ data: org }, { data: profile }] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", membership.organization_id).single(),
    supabase.from("users").select("first_name, last_name, email").eq("id", user.id).single(),
  ]);
  if (!org) return null;
  return toSession({ id: user.id, email: user.email ?? "" }, profile, org, membership);
});

export async function requireSession(): Promise<Session> {
  const user = await getUser();
  if (!user) redirect("/login");
  const session = await getSession();
  if (!session) redirect("/onboarding/company");
  return session;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// For server actions and route handlers: throws instead of redirecting.
export async function requireSessionOrThrow(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Not signed in or no organisation");
  return session;
}

export function requireRole(session: Session, roles: Role[]) {
  if (!roles.includes(session.role)) throw new HttpError(403, "You do not have permission to do this");
}

export const isAdmin = (s: Session) => s.role === "owner" || s.role === "admin";

// Service client for runtime writes after the caller's membership has been verified.
export function adminDb() {
  return createServiceClient();
}
