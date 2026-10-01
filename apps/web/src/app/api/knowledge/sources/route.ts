import { requireApiSession } from "@/lib/api-auth";
import { handle } from "@/lib/actions";
import { companyBrief, listSources } from "@/server/knowledge";

// GET /api/knowledge/sources: the sources with their reading status, and the brief, for the
// page to follow while sources are read.
export async function GET(request: Request) {
  return handle(async () => {
    const session = await requireApiSession(request);
    const [sources, brief] = await Promise.all([listSources(session), companyBrief(session)]);
    return { sources, ...brief };
  });
}
