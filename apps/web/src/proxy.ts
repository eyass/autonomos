import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages anyone can read. They render without Supabase, so they also work on a deployment
// that has no Supabase configuration.
const SITE_PATHS = [
  "/landing",
  "/solutions",
  "/security",
  "/docs",
  "/terms",
  "/privacy",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph-image",
  "/apple-icon",
  "/not-found",
];
// Public, but they need Supabase to do anything useful.
const AUTH_PATHS = ["/auth", "/api/webhooks", "/api/integrations/callback"];
const LANDING = "/landing";
// Signed-in areas. A signed-out visitor is sent to sign in only for these; any other unknown
// address shows the public site's "not found" page instead of a login form.
const APP_PATHS = [
  "/approvals",
  "/processes",
  "/opportunities",
  "/discover",
  "/playbooks",
  "/agents",
  "/activity",
  "/integrations",
  "/settings",
  "/workspaces",
  "/admin",
  "/onboarding",
  "/api",
];
const NOT_FOUND = "/not-found";

const matches = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(`${p}/`));

const NOT_CONFIGURED_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Not configured · AutonomOS</title></head>
<body style="margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#f7f7f5;color:#1b1b1a;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box">
<main style="max-width:28rem;text-align:center">
<h1 style="font-size:1.125rem;margin:0 0 .5rem">This deployment is not configured</h1>
<p style="font-size:.875rem;color:#6b6a66;margin:0">Supabase is not configured for this deployment. See the Production section of the README.</p>
</main>
</body>
</html>`;

// Refreshes the Supabase session on every request, shows signed-out visitors the marketing
// site at "/" and keeps them out of the app.
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isSite = matches(path, SITE_PATHS);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Preview deployments can lack the Supabase variables. Keep the public site up and
  // answer everything else with a plain 503 instead of crashing.
  if (!url || !key) {
    if (path === "/") return NextResponse.rewrite(new URL(LANDING, request.url));
    if (isSite) return NextResponse.next();
    return new NextResponse(NOT_CONFIGURED_HTML, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && path === "/") {
    const rewrite = NextResponse.rewrite(new URL(LANDING, request.url), { request });
    for (const cookie of response.cookies.getAll()) rewrite.cookies.set(cookie);
    return rewrite;
  }

  // API-key requests are authenticated by the route handler itself.
  const apiKey = path.startsWith("/api/") && (request.headers.get("authorization") ?? "").startsWith("Bearer aos_");
  const isPublic = isSite || apiKey || matches(path, AUTH_PATHS);
  if (!user && !isPublic) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    if (!matches(path, APP_PATHS)) return NextResponse.rewrite(new URL(NOT_FOUND, request.url), { status: 404 });
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
