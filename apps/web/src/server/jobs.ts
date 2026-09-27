import "server-only";
import { sendNotification, type Json } from "@autonomos/db";
import { after } from "next/server";
import { adminDb, HttpError, sessionFor, type Session } from "@/lib/session";

// Background jobs: work that takes longer than a click runs on the server, recorded in
// background_jobs, and the page only follows it (GET /api/jobs/:id). Closing the browser or
// reloading never stops it. A running job beats a heartbeat; if the server running it stops
// (a crash, a deploy, the time limit), the next read notices the missing heartbeat and runs
// it again, up to MAX_ATTEMPTS. Handlers are written so that running twice is safe.

export type JobKind = "website_profile" | "profile_refresh" | "document_import" | "opportunities" | "build_agent" | "sample_workspace";

export type JobView = {
  id: string;
  kind: JobKind;
  status: "queued" | "running" | "done" | "failed";
  // Where to go when it is done (the handler decides), and what it produced.
  result: (Record<string, unknown> & { href?: string }) | null;
  error: string | null;
  elapsed: number;
  label: string;
};

type Context = { userId: string; email: string; session: Session | null; input: Record<string, unknown>; attempt: number };
type Handler = (ctx: Context) => Promise<Record<string, unknown> & { href?: string }>;

const HEARTBEAT_MS = 10_000;
// No heartbeat for this long means the server running the job stopped.
const STALE_MS = 45_000;
const MAX_ATTEMPTS = 2;
// Under the platform's time limit (maxDuration 300), so a slow job fails cleanly instead of being cut off.
const BUDGET_MS = 270_000;
// Someone who looked at the job this recently is still on the page and sees the result there.
const WATCHING_MS = 15_000;

export const JOB_LABELS: Record<JobKind, string> = {
  website_profile: "Reading your website",
  profile_refresh: "Reading your website again",
  document_import: "Extracting processes from the document",
  opportunities: "Finding automation ideas",
  build_agent: "Building and testing the agent",
  sample_workspace: "Setting up the sample workspace",
};

// Handlers are loaded lazily so this module stays light for the routes that only read jobs.
async function handlerFor(kind: JobKind): Promise<Handler> {
  const handlers = await import("@/server/job-handlers");
  return handlers.HANDLERS[kind];
}

type Row = {
  id: string;
  organization_id: string | null;
  user_id: string;
  kind: string;
  subject: string | null;
  input: Json;
  status: string;
  result: Json | null;
  error: string | null;
  attempts: number;
  heartbeat_at: string | null;
  last_polled_at: string | null;
  created_at: string;
};

const age = (at: string | null) => (at ? Date.now() - new Date(at).getTime() : Infinity);
const isStale = (r: Row) => (r.status === "queued" || r.status === "running") && age(r.heartbeat_at ?? r.created_at) > STALE_MS;

function toView(r: Row): JobView {
  return {
    id: r.id,
    kind: r.kind as JobKind,
    status: r.status as JobView["status"],
    result: (r.result as JobView["result"]) ?? null,
    error: r.error,
    elapsed: Math.max(0, Math.round(age(r.created_at) / 1000)),
    label: JOB_LABELS[r.kind as JobKind] ?? "Working",
  };
}

// Starts a job, or returns the one already under way for the same thing (a second click,
// another tab), so work is never done twice at once.
export async function startJob(opts: { userId: string; organizationId: string | null; kind: JobKind; subject?: string | null; input?: Record<string, unknown> }): Promise<JobView> {
  const db = adminDb();
  let existing = db.from("background_jobs").select("*").eq("user_id", opts.userId).eq("kind", opts.kind).in("status", ["queued", "running"]).order("created_at", { ascending: false }).limit(1);
  existing = opts.organizationId ? existing.eq("organization_id", opts.organizationId) : existing.is("organization_id", null);
  existing = opts.subject ? existing.eq("subject", opts.subject) : existing.is("subject", null);
  const { data: running } = await existing.maybeSingle();
  if (running && !isStale(running)) return toView(running);

  const { data, error } = await db
    .from("background_jobs")
    .insert({ user_id: opts.userId, organization_id: opts.organizationId, kind: opts.kind, subject: opts.subject ?? null, input: (opts.input ?? {}) as never, heartbeat_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error || !data) throw new Error(`start job: ${error?.message}`);
  after(() => runJob(data.id));
  return toView(data);
}

// Runs a job if it is waiting or its runner stopped. Claiming is one conditional update, so
// two servers never run the same job at the same time.
export async function runJob(id: string) {
  const db = adminDb();
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  const { data: row } = await db.from("background_jobs").select("*").eq("id", id).maybeSingle();
  if (!row || row.status === "done" || row.status === "failed") return;
  if (row.status === "running" && !isStale(row)) return;
  const claim = db
    .from("background_jobs")
    .update({ status: "running", attempts: row.attempts + 1, heartbeat_at: now, updated_at: now })
    .eq("id", id)
    .eq("attempts", row.attempts);
  const { data: claimed } = await (row.status === "queued" && row.attempts === 0 ? claim : claim.lt("heartbeat_at", staleBefore)).select("*").maybeSingle();
  if (!claimed) return;

  const beat = setInterval(() => {
    void db.from("background_jobs").update({ heartbeat_at: new Date().toISOString() }).eq("id", id).eq("status", "running");
  }, HEARTBEAT_MS);
  try {
    const session = claimed.organization_id ? await sessionFor(claimed.user_id, claimed.organization_id) : null;
    if (claimed.organization_id && !session) throw new HttpError(403, "You are no longer a member of this workspace");
    const { data: user } = await db.from("users").select("email").eq("id", claimed.user_id).maybeSingle();
    const handler = await handlerFor(claimed.kind as JobKind);
    const result = await Promise.race([
      handler({ userId: claimed.user_id, email: user?.email ?? "", session, input: (claimed.input as Record<string, unknown>) ?? {}, attempt: claimed.attempts }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new HttpError(504, "This took longer than five minutes, so it was stopped. Try again.")), BUDGET_MS)),
    ]);
    const { data: done } = await db
      .from("background_jobs")
      .update({ status: "done", result: result as Json, error: null, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (done) await tellIfAway(done, "done");
  } catch (e) {
    console.error("job failed", claimed.kind, id, e);
    const message = e instanceof HttpError ? e.message : "Something went wrong. The error has been logged; try again.";
    const { data: failed } = await db
      .from("background_jobs")
      .update({ status: "failed", error: message, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (failed) await tellIfAway(failed, "failed");
  } finally {
    clearInterval(beat);
  }
}

// Someone who closed the page still hears how it went.
async function tellIfAway(r: Row, outcome: "done" | "failed") {
  if (!r.organization_id || age(r.last_polled_at) < WATCHING_MS) return;
  const label = JOB_LABELS[r.kind as JobKind] ?? "A background job";
  const href = (r.result as { href?: string } | null)?.href;
  await sendNotification(adminDb(), r.organization_id, {
    kind: outcome === "done" ? "discovery_ready" : "discovery_failed",
    title: outcome === "done" ? `${label}: finished` : `${label}: did not finish`,
    body: outcome === "done" ? "It finished while you were away." : (r.error ?? "Try again."),
    link: outcome === "done" && href?.startsWith("/") && !href.startsWith("/api/") ? href : "/",
    key: `job:${r.id}:${outcome}`,
  }).catch((e) => console.error("notification failed", e));
}

// A job as its owner sees it. Reading it also revives a job whose runner stopped.
export async function getJob(userId: string, id: string): Promise<JobView> {
  const db = adminDb();
  const { data: row } = await db.from("background_jobs").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!row) throw new HttpError(404, "Job not found");
  await db.from("background_jobs").update({ last_polled_at: new Date().toISOString() }).eq("id", id);
  return toView(await revive(row));
}

async function revive(row: Row): Promise<Row> {
  if (!isStale(row)) return row;
  if (row.attempts >= MAX_ATTEMPTS) {
    const { data } = await adminDb()
      .from("background_jobs")
      .update({ status: "failed", error: "The server stopped while working on this. Try again.", finished_at: new Date().toISOString() })
      .eq("id", row.id)
      .in("status", ["queued", "running"])
      .select("*")
      .maybeSingle();
    return data ?? row;
  }
  after(() => runJob(row.id));
  return row;
}

// The newest job of a kind for a page to pick up after a reload: one under way, or with
// includeDone one that finished in the last half hour (a result that arrived while the page
// was closed).
export async function latestJob(opts: { userId: string; organizationId: string | null; kind: JobKind; subject?: string | null; includeDone?: boolean }): Promise<JobView | null> {
  let q = adminDb()
    .from("background_jobs")
    .select("*")
    .eq("user_id", opts.userId)
    .eq("kind", opts.kind)
    .gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  q = opts.organizationId ? q.eq("organization_id", opts.organizationId) : q.is("organization_id", null);
  if (opts.subject) q = q.eq("subject", opts.subject);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  if (data.status === "queued" || data.status === "running") return toView(await revive(data));
  // A recent failure is returned too, so the page can say what went wrong and offer a retry.
  if (data.status === "failed") return toView(data);
  return opts.includeDone && data.status === "done" ? toView(data) : null;
}

// Jobs under way in a workspace, for a notice on the pages they belong to.
export async function activeJobs(organizationId: string, userId: string): Promise<JobView[]> {
  const { data } = await adminDb()
    .from("background_jobs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(10);
  return Promise.all((data ?? []).map(async (r) => toView(await revive(r))));
}
