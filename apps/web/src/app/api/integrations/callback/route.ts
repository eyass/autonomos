import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { completeOAuthConnection, safeReturnTo } from "@/server/integrations";

// The first inventory of the system runs after the redirect; give it room to finish.
export const maxDuration = 300;

// Composio OAuth return. The connected account is verified server-side before it is stored.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", url.origin));
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
