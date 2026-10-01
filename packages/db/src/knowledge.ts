import { embedTexts, mergeCompanyBrief } from "@autonomos/ai";
import { redactPersonal, splitPassages } from "@autonomos/integrations";
import { newSiteState, readSite, type SitePage, type SiteReadState } from "@autonomos/integrations/site-reader";
import { CompanyBriefSchema, type CompanyBrief } from "@autonomos/schemas";
import type { DbClient } from "./index";

// Company knowledge: reading a source into passages (with embeddings) and folding what it
// says into the company brief. Runs on the worker (packages/workflows, knowledge-ingest) with
// a long time budget; a website read that runs out of time saves its state and returns
// done: false, so the worker runs it again from where it stopped.

type Source = {
  id: string;
  organization_id: string;
  kind: string;
  title: string;
  url: string | null;
  content: string | null;
  crawl: unknown;
  pages: number;
  passages: number;
  chars: number;
};
type Crawl = { state: SiteReadState; ordinal: number };
type Row = { organization_id: string; source_id: string; ordinal: number; url: string | null; heading: string | null; content: string; embedding: string };

const MAX_PASSAGES = 5000;
const vector = (v: number[]) => `[${v.map((x) => x.toFixed(6)).join(",")}]`;

export type IngestOptions = { budgetMs?: number; allowPrivate?: boolean; fetchImpl?: typeof fetch };
export type IngestResult = { done: boolean; status: "ready" | "failed" | "processing"; passages: number };

export async function ingestSource(db: DbClient, sourceId: string, opts: IngestOptions = {}): Promise<IngestResult> {
  const { data: source } = await db.from("knowledge_sources").select("id, organization_id, kind, title, url, content, crawl, pages, passages, chars").eq("id", sourceId).maybeSingle();
  if (!source) return { done: true, status: "failed", passages: 0 };
  const s = source as Source;
  const fresh = !s.crawl;
  await db.from("knowledge_sources").update({ status: "processing", error: null }).eq("id", s.id);
  try {
    if (fresh) await db.from("knowledge_passages").delete().eq("source_id", s.id);
    const done = s.kind === "website" || s.kind === "help_center" || s.kind === "url" ? await readWebsite(db, s, opts) : await readText(db, s);
    if (!done) return { done: false, status: "processing", passages: s.passages };
    const { count } = await db.from("knowledge_passages").select("id", { count: "exact", head: true }).eq("source_id", s.id);
    await updateBrief(db, s);
    const crawl = s.crawl as Crawl | null;
    const summary =
      s.kind === "file" || s.kind === "paste"
        ? `${(count ?? 0).toLocaleString("en")} passages`
        : `${(crawl?.state.counts.read ?? 0).toLocaleString("en")} pages read${crawl?.state.counts.sampledOut ? `, ${crawl.state.counts.sampledOut.toLocaleString("en")} similar pages sampled` : ""}${crawl?.state.counts.unreadable ? `, ${crawl.state.counts.unreadable} could not be read` : ""}`;
    await db
      .from("knowledge_sources")
      .update({ status: (count ?? 0) > 0 ? "ready" : "failed", error: (count ?? 0) > 0 ? null : "Nothing readable was found in this source.", passages: count ?? 0, summary, processed_at: new Date().toISOString() })
      .eq("id", s.id);
    return { done: true, status: (count ?? 0) > 0 ? "ready" : "failed", passages: count ?? 0 };
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 300) : "Reading this source failed";
    await db.from("knowledge_sources").update({ status: "failed", error: message }).eq("id", s.id);
    return { done: true, status: "failed", passages: s.passages };
  }
}

// A file or pasted text: redacted, split, embedded and stored in one go.
async function readText(db: DbClient, s: Source): Promise<boolean> {
  const text = redactPersonal(s.content ?? "");
  const passages = splitPassages(text).slice(0, MAX_PASSAGES);
  await store(db, s, passages.map((p, i) => ({ ...p, url: null, ordinal: i })));
  await db.from("knowledge_sources").update({ chars: text.length, passages: passages.length }).eq("id", s.id);
  return true;
}

// A website or help centre, read breadth first; pages are stored in batches as they come in.
async function readWebsite(db: DbClient, s: Source, opts: IngestOptions): Promise<boolean> {
  const saved = s.crawl as Crawl | null;
  let crawl: Crawl;
  if (saved?.state) crawl = saved;
  else {
    // A website read leaves the company's help centre to its own source.
    const { data: help } = await db.from("knowledge_sources").select("url").eq("organization_id", s.organization_id).eq("kind", "help_center");
    const exclude = s.kind === "website" ? (help ?? []).map((h) => h.url).filter((u): u is string => Boolean(u)) : [];
    crawl = { state: newSiteState(s.url!, s.kind === "website" ? "website" : "help_center", exclude), ordinal: 0 };
  }
  let pending: SitePage[] = [];
  const flush = async () => {
    const pages = pending;
    pending = [];
    const rows = pages.flatMap((page) => splitPassages(redactPersonal(page.text)).map((p) => ({ heading: p.heading ?? page.title, content: p.content, url: page.url })));
    const room = MAX_PASSAGES - crawl.ordinal;
    const kept = rows.slice(0, Math.max(0, room)).map((r) => ({ ...r, ordinal: crawl.ordinal++ }));
    await store(db, s, kept);
    s.crawl = crawl;
    await db
      .from("knowledge_sources")
      .update({ crawl: crawl as never, pages: crawl.state.counts.read, passages: crawl.ordinal, chars: s.chars + pages.reduce((n, p) => n + p.text.length, 0) })
      .eq("id", s.id);
  };
  const state = await readSite(crawl.state, {
    fetch: { timeoutMs: 6000, allowPrivate: opts.allowPrivate ?? process.env.CRAWL_ALLOW_PRIVATE === "1", fetchImpl: opts.fetchImpl ?? fetch },
    deadline: Date.now() + (opts.budgetMs ?? 13 * 60_000),
    onPage: async (page) => {
      pending.push(page);
      if (pending.length >= 20) await flush();
    },
  });
  crawl.state = state;
  await flush();
  return state.done;
}

async function store(db: DbClient, s: Source, passages: Array<{ heading: string | null; content: string; url: string | null; ordinal: number }>) {
  for (let i = 0; i < passages.length; i += 100) {
    const batch = passages.slice(i, i + 100);
    const vectors = await embedTexts(
      batch.map((p) => (p.heading ? `${p.heading}\n${p.content}` : p.content)),
      "document",
    );
    const rows: Row[] = batch.map((p, j) => ({ organization_id: s.organization_id, source_id: s.id, ordinal: p.ordinal, url: p.url, heading: p.heading, content: p.content, embedding: vector(vectors[j]!) }));
    const { error } = await db.from("knowledge_passages").insert(rows);
    if (error) throw new Error(`Could not store passages: ${error.message}`);
  }
}

// Folds one source into the brief: its most telling passages (policies, help and about pages
// first), so a thousand-page site still fits one model call.
async function updateBrief(db: DbClient, s: Source) {
  const [{ data: org }, { data: passages }] = await Promise.all([
    db.from("organizations").select("name, industry, company_brief").eq("id", s.organization_id).single(),
    db.from("knowledge_passages").select("heading, content, url").eq("source_id", s.id).order("ordinal").limit(400),
  ]);
  if (!org || !passages?.length) return;
  const telling = /polic|refund|return|shipping|delivery|warranty|terms|faq|help|support|about|pricing|how/i;
  const ranked = [...passages].sort((a, b) => Number(telling.test(`${b.heading} ${b.url}`)) - Number(telling.test(`${a.heading} ${a.url}`)));
  const current = org.company_brief ? CompanyBriefSchema.safeParse(org.company_brief) : null;
  const brief = await mergeCompanyBrief({
    company: { name: org.name, industry: org.industry },
    brief: current?.success ? current.data : null,
    source: { id: s.id, title: s.title, kind: s.kind },
    passages: ranked.slice(0, 60),
  });
  await db.from("organizations").update({ company_brief: brief as never, company_brief_at: new Date().toISOString() }).eq("id", s.organization_id);
}

// The brief from scratch over the sources that remain (after one was removed).
export async function rebuildBrief(db: DbClient, organizationId: string) {
  await db.from("organizations").update({ company_brief: null, company_brief_at: null }).eq("id", organizationId);
  const { data: sources } = await db.from("knowledge_sources").select("id, organization_id, kind, title, url, content, crawl, pages, passages, chars").eq("organization_id", organizationId).eq("status", "ready").order("created_at");
  for (const s of (sources ?? []) as Source[]) await updateBrief(db, s);
}

export type KnowledgeHit = { title: string; heading: string | null; excerpt: string; url: string | null; sourceId: string };

// The passages that best answer a question, by meaning and by keyword.
export async function searchKnowledge(db: DbClient, organizationId: string, query: string, k = 6): Promise<KnowledgeHit[]> {
  const [embedding] = await embedTexts([query], "query");
  const { data, error } = await db.rpc("match_knowledge", { org: organizationId, query_embedding: vector(embedding!), query_text: query, match_count: k });
  if (error) throw new Error(`knowledge search: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: string; source_id: string; heading: string | null; content: string; url: string | null }>;
  if (!rows.length) return [];
  const { data: sources } = await db.from("knowledge_sources").select("id, title").in("id", [...new Set(rows.map((r) => r.source_id))]);
  const titles = new Map((sources ?? []).map((x) => [x.id, x.title]));
  return rows.map((r) => ({ title: titles.get(r.source_id) ?? "Company knowledge", heading: r.heading, excerpt: r.content.slice(0, 900), url: r.url, sourceId: r.source_id }));
}

// The brief as a few compact lines for prompts (discovery, ideas, agents).
export function briefText(raw: unknown, max = 2500): string | null {
  const parsed = raw ? CompanyBriefSchema.safeParse(raw) : null;
  if (!parsed?.success) return null;
  const b: CompanyBrief = parsed.data;
  const lines = [
    b.summary,
    b.offering.length ? `Offers: ${b.offering.join("; ")}` : "",
    b.customers ? `Customers: ${b.customers}` : "",
    ...b.policies.map((p) => `Policy (${p.topic}): ${p.rule}`),
    b.tone ? `Tone with customers: ${b.tone}` : "",
    b.terminology.length ? `Terms: ${b.terminology.map((t) => `${t.term} = ${t.meaning}`).join("; ")}` : "",
    ...b.facts.slice(0, 20).map((f) => f.text),
  ].filter(Boolean);
  const text = lines.join("\n").slice(0, max);
  return text || null;
}
