import { z } from "zod";
import { requireApiSession } from "@/lib/api-auth";
import { handle } from "@/lib/actions";
import { interviewState } from "@/server/processes";

// GET /api/interviews/:id — the interview as it stands, including a turn still being worked on.
// The Discover page polls this while an answer is processed.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireApiSession(request);
    return interviewState(
      session,
      z
        .string()
        .uuid()
        .parse((await params).id),
    );
  });
}
