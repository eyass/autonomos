import { z } from "zod";
import { handle } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { adminDb, getUser, HttpError, requireRole, requireSessionOrThrow } from "@/lib/session";
import { startJob } from "@/server/jobs";
import { DocumentImportSchema, processGate } from "@/server/processes";

// The job starts here and keeps running after this responds, in this function.
export const maxDuration = 300;

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("website_profile"), input: z.object({ website: z.string().trim().min(1).max(300) }) }),
  z.object({ kind: z.literal("profile_refresh"), input: z.object({}).default({}) }),
  z.object({ kind: z.literal("document_import"), input: DocumentImportSchema }),
  z.object({ kind: z.literal("opportunities"), input: z.object({ processId: z.string().uuid(), approve: z.boolean().default(false), complianceOwner: z.string().trim().max(120).optional() }) }),
  z.object({ kind: z.literal("build_agent"), input: z.object({ opportunityId: z.string().uuid() }) }),
  z.object({ kind: z.literal("sample_workspace"), input: z.object({}).default({}) }),
]);

// POST /api/jobs — starts a background job (or returns the one already under way for the
// same thing) after checking the person may do it. The page then follows GET /api/jobs/:id.
export async function POST(request: Request) {
  return handle(async () => {
    const body = Body.parse(await request.json());
    if (body.kind === "website_profile") {
      // Onboarding: there is no workspace yet.
      const user = await getUser();
      if (!user) throw new HttpError(401, "Sign in first");
      rateLimit(`website:${user.id}`, 6, 60_000);
      return startJob({ userId: user.id, organizationId: null, kind: body.kind, subject: body.input.website.toLowerCase(), input: body.input });
    }
    const session = await requireSessionOrThrow();
    const db = adminDb();
    const base = { userId: session.user.id, organizationId: session.org.id, kind: body.kind };
    switch (body.kind) {
      case "profile_refresh":
        requireRole(session, ["owner", "admin"]);
        if (!session.org.website) throw new HttpError(409, "Add the company website first");
        rateLimit(`website:${session.user.id}`, 6, 60_000);
        return startJob({ ...base, input: {} });
      case "document_import":
        rateLimit(`ai:${session.user.id}`, 30, 60_000);
        return startJob({ ...base, input: body.input });
      case "opportunities": {
        const { data } = await db.from("processes").select("id, status").eq("organization_id", session.org.id).eq("id", body.input.processId).maybeSingle();
        if (!data) throw new HttpError(404, "Process not found");
        if (!body.input.approve && (data.status === "draft" || data.status === "candidate")) throw new HttpError(409, "Review the process before generating opportunities");
        // Say what is missing now, before a background job is started for nothing.
        const gate = await processGate(session, body.input.processId);
        if (body.input.approve && gate.gaps.length) throw new HttpError(409, `Fill in the details before approving: ${gate.gaps.join("; ")}.`);
        if (gate.sensitive.length && !gate.complianceOwner && !body.input.complianceOwner) {
          throw new HttpError(409, `This process involves ${gate.sensitive.join(" and ")}. Name who signs off on compliance first.`);
        }
        rateLimit(`ai:${session.user.id}`, 30, 60_000);
        return startJob({ ...base, subject: body.input.processId, input: body.input });
      }
      case "build_agent": {
        const { data } = await db.from("automation_opportunities").select("id").eq("organization_id", session.org.id).eq("id", body.input.opportunityId).maybeSingle();
        if (!data) throw new HttpError(404, "Opportunity not found");
        rateLimit(`ai:${session.user.id}`, 30, 60_000);
        return startJob({ ...base, subject: body.input.opportunityId, input: body.input });
      }
      case "sample_workspace":
        // Not tied to the current workspace: one sample per person.
        return startJob({ userId: session.user.id, organizationId: session.org.id, kind: body.kind, subject: "sample", input: {} });
    }
  });
}
