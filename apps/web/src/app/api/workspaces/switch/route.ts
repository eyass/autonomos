import { NextResponse, type NextRequest } from "next/server";

// A relative Location keeps the host the browser used (behind a proxy request.url can differ).
const to = (path: string) => new NextResponse(null, { status: 303, headers: { location: path } });
import { z } from "zod";
import { requireSessionOrThrow } from "@/lib/session";
import { switchWorkspace } from "@/server/platform";

// GET /api/workspaces/switch?to=<id> — opens a workspace the person belongs to. Used when a
// background job (the sample workspace) finishes, since only a request can set the cookie.
export async function GET(request: NextRequest) {
  const id = z.string().uuid().safeParse(request.nextUrl.searchParams.get("to"));
  try {
    if (!id.success) throw new Error("bad id");
    await switchWorkspace(await requireSessionOrThrow(), id.data);
  } catch {
    return to("/workspaces");
  }
  return to("/");
}
