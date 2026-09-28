import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { browseAll } from "@/server/tool-browser";

// The whole tool directory for the tool browser. The browser keeps it for an hour; what is
// connected in the workspace comes with the page, so a cached copy is never stale on that.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const tools = await browseAll(session);
  return NextResponse.json({ tools }, { headers: { "cache-control": "private, max-age=3600" } });
}
