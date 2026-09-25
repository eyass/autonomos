import { createHmac, timingSafeEqual } from "node:crypto";
import { INTEGRATION_EVENTS } from "@autonomos/schemas";
import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { adminDb, HttpError } from "@/lib/session";
import { dispatchIntegrationEvent } from "@/server/agents";

// Inbound integration events (PRD section 31).
// Contract: POST JSON { "event": "zendesk.ticket.created", "data": { ... } } with header
// X-AutonomOS-Signature: sha256=<hex HMAC-SHA256 of the raw body using the connection's webhook secret>.
const Body = z.object({ event: z.string(), data: z.record(z.string(), z.unknown()) });

const EVENT_INTEGRATION: Record<string, string> = Object.fromEntries(INTEGRATION_EVENTS.map((e) => [e.key, e.integration]));

export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/[connectionId]">) {
  const { connectionId } = await ctx.params;
  try {
    rateLimit(`webhook:${connectionId}`, 120, 60_000);
    const raw = await request.text();
    const db = adminDb();
    const { data: secret } = await db.from("integration_secrets").select("webhook_secret, organization_id").eq("connection_id", connectionId).maybeSingle();
    if (!secret) throw new HttpError(404, "Unknown connection");
    const expected = `sha256=${createHmac("sha256", secret.webhook_secret).update(raw).digest("hex")}`;
    const given = request.headers.get("x-autonomos-signature") ?? "";
    if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) throw new HttpError(401, "Invalid signature");

    const body = Body.parse(JSON.parse(raw));
    const { data: conn } = await db
      .from("integration_connections")
      .select("integration_key, status")
      .eq("id", connectionId)
      .eq("organization_id", secret.organization_id)
      .single();
    if (!conn || conn.status !== "connected") throw new HttpError(409, "Connection is not active");
    if (EVENT_INTEGRATION[body.event] !== conn.integration_key) throw new HttpError(400, `Event ${body.event} does not belong to ${conn.integration_key}`);

    const runIds = await dispatchIntegrationEvent(secret.organization_id, body.event, body.data);
    await db.from("audit_events").insert({ organization_id: secret.organization_id, actor_type: "system", action: "webhook.received", system: conn.integration_key, input: { event: body.event } as never, output: { runIds } as never, result: "success" });
    return NextResponse.json({ ok: true, runs: runIds.length });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : e instanceof z.ZodError || e instanceof SyntaxError ? 400 : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ ok: false, error: e instanceof Error && status !== 500 ? e.message : "Failed" }, { status });
  }
}
