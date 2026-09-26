import { requireApiSession } from "@/lib/api-auth";
import { z } from "zod";
import { handle } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";

import { answerInterview, DocumentImportSchema, finishInterview, importDocument, startInterview } from "@/server/processes";

const Body = z.discriminatedUnion("method", [
  z.object({ method: z.literal("interview_start"), department: z.string().min(1) }),
  z.object({ method: z.literal("interview_answer"), sessionId: z.string().uuid(), answer: z.string().min(1) }),
  z.object({ method: z.literal("interview_finish"), sessionId: z.string().uuid(), titles: z.array(z.string()).optional() }),
  z.object({ method: z.literal("document"), document: DocumentImportSchema }),
]);

// POST /api/processes/discover
export async function POST(request: Request) {
  return handle(async () => {
    const session = await requireApiSession(request);
    rateLimit(`ai:${session.user.id}`, 30, 60_000);
    const body = Body.parse(await request.json());
    switch (body.method) {
      case "interview_start":
        return { sessionId: await startInterview(session, body.department) };
      case "interview_answer":
        return answerInterview(session, body.sessionId, body.answer);
      case "interview_finish":
        return { processIds: await finishInterview(session, body.sessionId, body.titles) };
      case "document":
        return importDocument(session, body.document);
    }
  });
}
