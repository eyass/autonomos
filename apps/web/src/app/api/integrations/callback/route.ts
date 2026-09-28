import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { completeOAuthConnection, safeReturnTo } from "@/server/integrations";

// The first inventory of the system runs after the redirect; give it room to finish.
export const maxDuration = 300;

// Composio OAuth return. The connected account is verified server-side before it is stored.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const session = await getSession();
  if (!session) {
    // Coming back from the vendor's site, some browsers leave out the sign-in cookie. Load
    // the same address again from our own page, where they send it.
    if (!url.searchParams.has("hop")) {
      const again = new URL(url);
      again.searchParams.set("hop", "1");
      return sameSiteHop(again.pathname + again.search);
    }
    const login = new URL("/login", url.origin);
    login.searchParams.set("next", url.pathname + url.search);
    return NextResponse.redirect(login);
  }
  const integration = url.searchParams.get("integration") ?? "";
  const accountId = url.searchParams.get("connected_account_id") ?? url.searchParams.get("connectedAccountId") ?? "";
  const status = url.searchParams.get("status");
  const next = safeReturnTo(url.searchParams.get("next"));
  if (!integration || !accountId || (status && status !== "success")) {
    return NextResponse.redirect(new URL("/integrations?error=connection_failed", url.origin));
  }
  try {
    await completeOAuthConnection(session, integration, accountId);
    return NextResponse.redirect(new URL(next ? `${next}?connected=${encodeURIComponent(integration)}` : `/integrations?connected=${integration}`, url.origin));
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(new URL("/integrations?error=connection_failed", url.origin));
  }
}

// A page of our own that moves on to `path`, so the browser treats the request as same-site.
function sameSiteHop(path: string) {
  const href = path.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${href}"><title>Connecting…</title></head><body style="font-family:system-ui,sans-serif;padding:2rem">Connecting… <a href="${href}">Continue</a></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } },
  );
}
