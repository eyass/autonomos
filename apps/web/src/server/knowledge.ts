import "server-only";
import { briefText, rebuildBrief } from "@autonomos/db";
import { helpCentreCandidates, homeLinks, normalizeWebsite } from "@autonomos/integrations/site-reader";
import { CompanyBriefSchema, planFor, type CompanyBrief, type KnowledgeSourceKind } from "@autonomos/schemas";
import { enqueueKnowledgeIngest, TriggerNotConfiguredError } from "@autonomos/workflows";
import { after } from "next/server";
import { audit } from "@/lib/audit";
import { adminDb, HttpError, isAdmin, type Session } from "@/lib/session";
import { extractFileText } from "@/server/extract-text";

// Company knowledge in a workspace: the sources it added (website, help centre, files, pasted
// text), their reading status, and the brief built from them. Reading happens on the worker
// (knowledge-ingest); this module adds sources, starts reads and shows where they are.

export type KnowledgeSourceView = {
  id: string;
  kind: KnowledgeSourceKind;
  title: string;
  url: string | null;
  hasFile: boolean;
  status: "queued" | "processing" | "ready" | "failed";
  error: string | null;
  pages: number;
  passages: number;
  summary: string | null;
  counts: { found?: number; read?: number; skipped?: number; sampledOut?: number; unreadable?: number; capped?: number } | null;
  createdAt: string;
  processedAt: string | null;
};

const FREE_PLAN_SOURCES = 20;
const BUCKET = "knowledge";

const requireEditor = (session: Session) => {
  if (!isAdmin(session)) throw new HttpError(403, "Only owners and admins can change the company knowledge");
};

export async function listSources(session: Session): Promise<KnowledgeSourceView[]> {
  const { data } = await adminDb()
    .from("knowledge_sources")
    .select("id, kind, title, url, file_path, status, error, pages, passages, summary, created_at, processed_at, counts:crawl->state->counts")
    .eq("organization_id", session.org.id)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind as KnowledgeSourceKind,
    title: r.title,
    url: r.url,
    hasFile: Boolean(r.file_path),
    status: r.status as KnowledgeSourceView["status"],
    error: r.error,
    pages: r.pages,
    passages: r.passages,
    summary: r.summary,
    counts: (r.counts as KnowledgeSourceView["counts"]) ?? null,
    createdAt: r.created_at,
    processedAt: r.processed_at,
  }));
}

export async function companyBrief(session: Session): Promise<{ brief: CompanyBrief | null; updatedAt: string | null }> {
  const { data } = await adminDb().from("organizations").select("company_brief, company_brief_at").eq("id", session.org.id).single();
  const parsed = data?.company_brief ? CompanyBriefSchema.safeParse(data.company_brief) : null;
  return { brief: parsed?.success ? parsed.data : null, updatedAt: data?.company_brief_at ?? null };
}

// The brief as prompt text for AI tasks in this workspace.
export async function knowledgeText(organizationId: string): Promise<string | null> {
  const { data } = await adminDb().from("organizations").select("company_brief").eq("id", organizationId).single();
  return briefText(data?.company_brief);
}

async function assertRoom(session: Session) {
  if (planFor(session.org.plan).price > 0) return;
  const { count } = await adminDb().from("knowledge_sources").select("id", { count: "exact", head: true }).eq("organization_id", session.org.id);
  if ((count ?? 0) >= FREE_PLAN_SOURCES) throw new HttpError(409, `The free plan holds ${FREE_PLAN_SOURCES} knowledge sources. Remove one or upgrade in Settings, Billing.`);
}

async function enqueue(sourceId: string) {
  try {
    await enqueueKnowledgeIngest(sourceId);
  } catch (e) {
    const message = e instanceof TriggerNotConfiguredError ? "The runtime that reads sources is not connected yet. It starts once an administrator connects it." : "Could not start reading this source. Try again.";
    await adminDb().from("knowledge_sources").update({ status: "failed", error: message }).eq("id", sourceId);
  }
}

export async function addFileSource(session: Session, file: File): Promise<string> {
  requireEditor(session);
  await assertRoom(session);
  const { title, content, mime } = await extractFileText(file);
  if (content.trim().length < 20) throw new HttpError(422, `No readable text in ${file.name}. Scanned PDFs need their text recognised first.`);
  const db = adminDb();
  const { data: source, error } = await db
    .from("knowledge_sources")
    .insert({ organization_id: session.org.id, kind: "file", title, content: content.slice(0, 2_000_000), mime, bytes: file.size, added_by: session.user.id })
    .select("id")
    .single();
  if (error || !source) throw new Error(`knowledge source: ${error?.message}`);
  const path = `${session.org.id}/${source.id}/${file.name.replace(/[^\w.\- ]+/g, "_")}`;
  const { error: upload } = await db.storage.from(BUCKET).upload(path, file, { contentType: mime, upsert: true });
  if (!upload) await db.from("knowledge_sources").update({ file_path: path }).eq("id", source.id);
  await audit(session, { action: "knowledge.source_added", input: { kind: "file", title, bytes: file.size } });
  await enqueue(source.id);
  return source.id;
}

export async function addPasteSource(session: Session, input: { title: string; text: string }): Promise<string> {
  requireEditor(session);
  await assertRoom(session);
  const text = input.text.trim();
  if (text.length < 40) throw new HttpError(422, "Paste at least a paragraph");
  const { data, error } = await adminDb()
    .from("knowledge_sources")
    .insert({ organization_id: session.org.id, kind: "paste", title: input.title.trim() || text.slice(0, 60), content: text.slice(0, 500_000), added_by: session.user.id })
    .select("id")
    .single();
  if (error || !data) throw new Error(`knowledge source: ${error?.message}`);
  await audit(session, { action: "knowledge.source_added", input: { kind: "paste", title: input.title } });
  await enqueue(data.id);
  return data.id;
}

// A help centre or another site, read from the address given.
export async function addUrlSource(session: Session, input: { url: string }): Promise<string> {
  requireEditor(session);
  await assertRoom(session);
  let url: string;
  try {
    url = normalizeWebsite(input.url);
  } catch {
    throw new HttpError(422, "Enter a web address, for example help.yourcompany.com");
  }
  const id = await upsertSiteSource(session, "help_center", url, `Help centre (${new URL(url).hostname}${new URL(url).pathname === "/" ? "" : new URL(url).pathname})`);
  await audit(session, { action: "knowledge.source_added", input: { kind: "help_center", url } });
  return id;
}

async function upsertSiteSource(session: Session, kind: "website" | "help_center", url: string, title: string): Promise<string> {
  const db = adminDb();
  const { data: existing } = await db.from("knowledge_sources").select("id, status").eq("organization_id", session.org.id).eq("kind", kind).eq("url", url).maybeSingle();
  if (existing) {
    if (existing.status === "failed") await readAgain(session, existing.id);
    return existing.id;
  }
  const { data, error } = await db.from("knowledge_sources").insert({ organization_id: session.org.id, kind, title, url, added_by: session.user.id }).select("id").single();
  if (error || !data) throw new Error(`knowledge source: ${error?.message}`);
  await enqueue(data.id);
  return data.id;
}

// The company's whole website and its help centre, once the website is known (onboarding).
// The help centre is found first, so the website read leaves its pages to it.
export async function startWebsiteSources(session: Session): Promise<void> {
  const { data: org } = await adminDb().from("organizations").select("website").eq("id", session.org.id).single();
  if (!org?.website) return;
  let home: string;
  try {
    home = normalizeWebsite(org.website);
  } catch {
    return;
  }
  // The website read itself reports a site that cannot be reached.
  const links = await homeLinks(home, { timeoutMs: 6000, allowPrivate: process.env.CRAWL_ALLOW_PRIVATE === "1", fetchImpl: fetch }).catch(() => [] as string[]);
  for (const help of helpCentreCandidates(home, links).slice(0, 3)) {
    const u = new URL(help);
    await upsertSiteSource(session, "help_center", help, `Help centre (${u.hostname}${u.pathname === "/" ? "" : u.pathname})`);
  }
  await upsertSiteSource(session, "website", home, `Website (${new URL(home).hostname})`);
}

export function startWebsiteSourcesInBackground(session: Session) {
  after(() => startWebsiteSources(session).catch((e) => console.error("website sources", e)));
}

// Reads a source again from the start (a failed read, or a website that has changed).
export async function readAgain(session: Session, sourceId: string) {
  requireEditor(session);
  const { error } = await adminDb().from("knowledge_sources").update({ status: "queued", error: null, crawl: null }).eq("organization_id", session.org.id).eq("id", sourceId);
  if (error) throw new Error(error.message);
  await enqueue(sourceId);
}

export async function removeSource(session: Session, sourceId: string) {
  requireEditor(session);
  const db = adminDb();
  const { data: source } = await db.from("knowledge_sources").select("id, title, file_path").eq("organization_id", session.org.id).eq("id", sourceId).maybeSingle();
  if (!source) throw new HttpError(404, "That source is gone");
  if (source.file_path) await db.storage.from(BUCKET).remove([source.file_path]);
  await db.from("knowledge_sources").delete().eq("id", source.id);
  await audit(session, { action: "knowledge.source_removed", input: { title: source.title } });
  // What the other sources say stays; the brief is rebuilt without this one.
  after(() => rebuildBrief(db, session.org.id).catch((e) => console.error("rebuild brief", e)));
}

// A link to the original upload, valid for ten minutes.
export async function originalFileUrl(session: Session, sourceId: string): Promise<string> {
  const { data: source } = await adminDb().from("knowledge_sources").select("file_path").eq("organization_id", session.org.id).eq("id", sourceId).maybeSingle();
  if (!source?.file_path) throw new HttpError(404, "No original file is kept for this source");
  const { data, error } = await adminDb().storage.from(BUCKET).createSignedUrl(source.file_path, 600);
  if (error || !data) throw new Error(error?.message ?? "No link");
  return data.signedUrl;
}

// A document imported on Discover is company knowledge too.
export async function addDocumentSource(session: Session, input: { documentId: string; title: string; content: string; paste: boolean }) {
  const { data } = await adminDb()
    .from("knowledge_sources")
    .insert({ organization_id: session.org.id, kind: input.paste ? "paste" : "file", title: input.title, content: input.content, document_id: input.documentId, added_by: session.user.id })
    .select("id")
    .single();
  if (data) await enqueue(data.id);
}

// Sources still waiting (imported documents, a read that never started) get started.
export async function startWaitingSources(session: Session) {
  const before = new Date(Date.now() - 60_000).toISOString();
  const { data } = await adminDb().from("knowledge_sources").select("id").eq("organization_id", session.org.id).eq("status", "queued").lt("created_at", before).limit(10);
  for (const s of data ?? []) await enqueue(s.id);
}
