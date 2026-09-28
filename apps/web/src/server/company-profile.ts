import "server-only";
import { profileCompany } from "@autonomos/ai";
import { crawlWebsite, websiteFromEmail, WebsiteError } from "@autonomos/integrations/website";
import { CompanyProfileSchema, type CompanyProfile } from "@autonomos/schemas";
import { z } from "zod";
import { audit, recordUsage } from "@/lib/audit";
import { adminDb, HttpError, requireRole, type Session } from "@/lib/session";

export const WebsiteAnalysisSchema = z.object({
  website: z.string().url(),
  profile: CompanyProfileSchema,
  pagesRead: z.array(z.object({ url: z.string(), kind: z.string(), title: z.string() })).max(30),
  // Any system the site shows it uses, keyed like the integrations catalog / Composio toolkit.
  detectedTools: z.array(z.object({ key: z.string().regex(/^[a-z0-9_]{2,60}$/), name: z.string().max(80), evidence: z.string().max(200) })).max(40),
  otherTechnology: z.array(z.string().max(60)).max(40),
});
export type WebsiteAnalysis = z.infer<typeof WebsiteAnalysisSchema>;

export function suggestedWebsite(email: string) {
  return websiteFromEmail(email);
}

// Reads the public website and drafts the company profile. Nothing is stored here:
// the user reviews the draft before the workspace is created.
export async function analyseWebsite(input: { website: string; email: string; organizationId?: string }): Promise<WebsiteAnalysis> {
  let snapshot;
  try {
    snapshot = await crawlWebsite(input.website, {
      // Only for the local end-to-end test site. Never set in production.
      allowPrivate: process.env.CRAWL_ALLOW_PRIVATE === "1",
    });
  } catch (e) {
    if (e instanceof WebsiteError) throw new HttpError(422, e.message);
    throw e;
  }
  const profile: CompanyProfile = await profileCompany({
    website: snapshot,
    emailDomain: input.email.split("@")[1] ?? null,
    onUsage: input.organizationId ? (u) => recordUsage(input.organizationId!, u) : undefined,
  });
  return {
    website: snapshot.url,
    profile,
    pagesRead: snapshot.pages.slice(0, 30).map((p) => ({ url: p.url, kind: p.kind, title: p.title })),
    detectedTools: snapshot.detectedTools.filter((t) => /^[a-z0-9_]{2,60}$/.test(t.key)).slice(0, 40),
    otherTechnology: snapshot.otherTechnology.slice(0, 40),
  };
}

/** Stores a reviewed analysis on the organisation. */
export async function saveWebsiteProfile(organizationId: string, analysis: WebsiteAnalysis) {
  await adminDb()
    .from("organizations")
    .update({
      website_profile: { ...analysis.profile, pagesRead: analysis.pagesRead, otherTechnology: analysis.otherTechnology } as never,
      website_profiled_at: new Date().toISOString(),
      detected_tools: [...new Set(analysis.detectedTools.map((t) => t.key))],
    })
    .eq("id", organizationId);
}

// Settings → "Refresh from website": re-reads the site and updates what the profile owns,
// leaving the name and hourly cost the team may have corrected.
export async function refreshWebsiteProfile(session: Session) {
  requireRole(session, ["owner", "admin"]);
  if (!session.org.website) throw new HttpError(409, "Add the company website first");
  const analysis = await analyseWebsite({ website: session.org.website, email: session.user.email, organizationId: session.org.id });
  await saveWebsiteProfile(session.org.id, analysis);
  await adminDb()
    .from("organizations")
    .update({
      company_summary: analysis.profile.summary,
      industry: analysis.profile.industry,
      employee_count: analysis.profile.employeeCount ?? session.org.employeeCount,
      country: analysis.profile.country ?? session.org.country,
    })
    .eq("id", session.org.id);
  await audit(session, {
    action: "organization.profile_refreshed",
    input: { website: analysis.website },
    output: { pages: analysis.pagesRead.length, tools: analysis.detectedTools.map((t) => t.key) },
  });
  return analysis;
}
