# Company knowledge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every company builds up one knowledge base (its whole website and help centre, files, pasted text) that discovery, ideas and agents use, via passages searchable by meaning and a company brief.

**Architecture:** Sources and passages in Postgres (pgvector, HNSW and a full-text index), originals in a private Storage bucket. Ingestion runs on the Trigger.dev worker (`knowledge-ingest`, 15-minute budget, resumable state on the source) using `packages/db/src/knowledge.ts`, which uses the crawler (`packages/integrations/src/site-reader.ts`), text tools (`packages/integrations/src/knowledge-text.ts`) and AI (`packages/ai`: `embedTexts`, `mergeCompanyBrief`). The web app adds sources, shows status, the brief and search, and feeds the brief to `companyContext()` and the agent prompt.

**Tech Stack:** Next.js 16 server actions, Supabase (Postgres 17, pgvector 0.8, Storage, RLS), Trigger.dev v4, AI SDK v7 (`embedMany`, Gemini `gemini-embedding-001` / OpenAI `text-embedding-3-small` at 768 dimensions), Vitest, Playwright.

Spec: `docs/superpowers/specs/2026-10-01-company-knowledge-design.md`.

---

## File map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20261001000030_company_knowledge.sql` | `vector` extension; `knowledge_sources`, `knowledge_passages` (RLS, indexes); `organizations.company_brief`; `match_knowledge` hybrid search function; private `knowledge` bucket and its policies; existing `documents` copied into sources |
| `packages/db/src/database.types.ts` | Regenerated types |
| `packages/integrations/src/knowledge-text.ts` | `cleanText`, `redactPersonal`, `splitPassages` (pure) |
| `packages/integrations/src/site-reader.ts` | `planUrl` (score/skip), `templateKey` (repeated sections), `helpCentreCandidates`, `readSite(start, state, opts)` breadth-first, resumable |
| `packages/integrations/src/website.ts` | Export `fetchHtml`, `fetchXml`, `fetchResource` options type for reuse |
| `packages/ai/src/embeddings.ts` | `embedTexts(texts, kind)` with provider choice and mock vectors |
| `packages/ai/src/tasks/brief.ts` | `mergeCompanyBrief({ brief, source, passages })` |
| `packages/schemas/src/index.ts` | `CompanyBriefSchema`, `KnowledgeSourceKind` |
| `packages/db/src/knowledge.ts` | `ingestSource(id, db)`, `searchKnowledge(db, org, query, k)`, `rebuildBrief(db, org)` |
| `packages/db/src/run-store.ts` | `knowledgeSearch` uses `searchKnowledge` |
| `packages/workflows/src/trigger/knowledge.ts` | `knowledge-ingest` task |
| `packages/workflows/src/index.ts` | `enqueueKnowledgeIngest(sourceId)` |
| `apps/web/e2e/trigger-stub.ts` | Runs `knowledge-ingest` too |
| `apps/web/src/server/knowledge.ts` | `addFileSource`, `addUrlSource`, `addPasteSource`, `startWebsiteSources`, `removeSource`, `retrySource`, `listSources`, `briefFor` |
| `apps/web/src/app/api/knowledge/upload/route.ts` | Multipart upload: extract text, store original, create source |
| `apps/web/src/app/(app)/knowledge/page.tsx` + `knowledge-panel.tsx` | Knowledge page |
| `apps/web/src/components/knowledge/add-sources.tsx`, `source-list.tsx`, `brief-view.tsx` | Shared by onboarding and the page |
| `apps/web/src/app/onboarding/knowledge/page.tsx` | Required step "Teach AutonomOS about you" |
| `apps/web/src/app/onboarding/steps.tsx`, onboarding actions | Step order company → knowledge → connect → mapping |
| `apps/web/src/server/processes.ts` | `companyContext()` includes the brief; document import creates a source |
| `packages/agents/src/engine.ts` | `company_context` includes the brief |
| `apps/web/src/components/shell/nav.tsx` | Knowledge item |

## Tasks

### Task 1: Text tools (TDD)
**Files:** create `packages/integrations/src/knowledge-text.ts`, `packages/integrations/test/knowledge-text.test.ts`; export from `index.ts`.
- `cleanText(text)`: normalise whitespace per line, drop lines repeated three or more times across a page set (handled by caller passing `boilerplate: Set<string>`), keep headings (`# `-prefixed from structuredText).
- `redactPersonal(text)`: emails → `[email]`, phone numbers → `[phone]`, IBANs → `[iban]`; keeps newlines.
- `splitPassages(text, { max: 1500, overlap: 150 })`: split on headings first, then paragraphs, then sentences; each passage `{ heading, content }`; never empty; heading carried into every passage of its section.
- Tests: redaction keeps line breaks; a 5,000-character section becomes passages ≤ 1,500 with overlap; headings carried; tiny text gives one passage; empty gives none.

### Task 2: Site reader (TDD with a fake fetch)
**Files:** create `packages/integrations/src/site-reader.ts`, test `packages/integrations/test/site-reader.test.ts`; export fetch helpers from `website.ts`.
- `planUrl(url, base)`: `{ skip: reason } | { score }`. Skip: other hosts (except help hosts), assets by extension, `login|log-in|signin|sign-in|signup|sign-up|register|account|my-account|password|reset|cart|basket|checkout|order-status|wishlist|search|tag|tags|category\/page|page\/\d+|\?page=|print|share|feed|wp-json|cdn-cgi|calendar|\d{4}\/\d{2}\/\d{2}`, `mailto:`, `tel:`, tracking params removed (`utm_*`, `gclid`, `fbclid`, `ref`). Score high (3) for help/support/faq/docs/guide/policy/returns/refund/shipping/delivery/terms/privacy/pricing/about/how-it-works/features/product overview; 2 for level-1 pages; 1 otherwise; lower by 0.5 per extra depth.
- `templateKey(url)`: path with id-like or slug-with-number segments replaced by `*` (`/listings/123` → `/listings/*`, `/blog/2024/05/x` → `/blog/*/*/*`).
- `helpCentreCandidates(origin, links, detectedTools)`: help paths and subdomains on the same registrable domain; hosted platforms (`*.zendesk.com/hc`, `intercom.help/*`, `*.freshdesk.com/support`, `*.helpscoutdocs.com`, `*.gitbook.io`, `notion.site`).
- `readSite(start, state, opts)`: breadth-first by depth (all level-1 before level-2), priority by score within a level, 8 concurrent, 6 s timeout, robots.txt disallow for `*` and our agent, sitemap URLs (all sitemaps, index depth 2) seeded at their path depth, canonical de-dup, text-hash de-dup, sampling 10 per template when a template has > 25 URLs (not for help centres), caps (1,000 / 2,000 pages), stops at `deadline` and returns state `{ frontier, visited, counts, sampled }` to resume. Yields pages `{ url, title, text }` via a callback.
- Tests: level-1 read before level-2; login/cart skipped; `/listings/1..200` sampled to 10 with count 200; robots disallow respected; resume continues from state without re-reading; help candidates from paths, subdomain and a Zendesk link.

### Task 3: Schemas and AI
**Files:** `packages/schemas/src/index.ts` (`CompanyBriefSchema`), `packages/ai/src/embeddings.ts`, `packages/ai/src/tasks/brief.ts`, export, tests `packages/ai/test/embeddings.test.ts`, `packages/ai/test/brief.test.ts` (mock mode).
- `CompanyBriefSchema`: `{ summary, offering[], customers, policies: [{ topic, rule, sourceId }], tone, products[], terminology: [{ term, meaning }], teams[], systems[], facts: [{ text, sourceId }] }` with defaults.
- `embedTexts(texts, kind: "document" | "query")`: batches of 100, 768 dimensions; Gemini (`taskType RETRIEVAL_DOCUMENT / RETRIEVAL_QUERY`) unless `AI_PROVIDER=openai`; mock (`AI_MOCK=1` or no key): deterministic hashed bag-of-words vector, normalised, so similar texts are close in tests.
- `mergeCompanyBrief({ company, brief, source: { id, title, kind }, passages })`: SMART model, structured output `CompanyBriefSchema`; rule in prompt: keep facts from other sources, add or refine with this source's id; passages fenced as untrusted. Mock merges by appending the first sentence of passages as facts.

### Task 4: Migration and types
- `create extension if not exists vector with schema extensions;`
- Tables as in the spec; `knowledge_passages.embedding extensions.vector(768)`, HNSW `vector_cosine_ops`, GIN on `search`; RLS: select for members, insert/update/delete via service role only (server actions use the admin client after role checks), as with `documents`.
- `match_knowledge(org uuid, query_embedding vector, query_text text, k int)` SQL function: reciprocal rank fusion of the top 30 by cosine and the top 30 by `ts_rank`, returns passage id, source id, heading, content, score.
- Storage bucket `knowledge` (private); objects under `<organization_id>/…`; select policy for members of that org.
- Copy `documents` into `knowledge_sources` (kind 'file', status 'queued', title, text in `content`) so they are ingested.
- Run `pnpm exec supabase migration up --local`; regenerate types: `pnpm exec supabase gen types typescript --local > packages/db/src/database.types.ts`.

### Task 5: Ingestion and search in packages/db (TDD against local DB where RLS matters)
- `ingestSource(db, sourceId, deps?)`: load the source; for website/help centre run `readSite` with state from `crawl` (persist state every 25 pages and at the end); for file/paste use `content`; clean, redact, split, embed (batches), insert passages (replace the source's passages on a fresh read); update counts and status; then `mergeCompanyBrief` into `organizations.company_brief`. Errors set `failed` with a customer-language reason.
- `searchKnowledge(db, org, query, k = 6)`: embed query (kind query), call `match_knowledge`, map to `{ title, heading, excerpt, sourceId }`.
- `rebuildBrief(db, org)`: brief from scratch over remaining sources (top passages per source).
- `run-store.knowledgeSearch` uses `searchKnowledge`.

### Task 6: Worker task and stub
- `packages/workflows/src/trigger/knowledge.ts`: `task({ id: "knowledge-ingest", maxDuration: 900, run: ({ sourceId }) => ingestSource(createServiceClient(), sourceId) })`; queue concurrency 2 per org.
- `enqueueKnowledgeIngest(sourceId)` in `packages/workflows/src/index.ts`.
- `apps/web/e2e/trigger-stub.ts`: route `knowledge-ingest` to `ingestSource`.

### Task 7: Web server and upload route
- `server/knowledge.ts`: role checks (owner/admin), plan cap (20 sources on the free plan), `addFileSource` (store original at `<org>/<source>/<name>` in bucket, text in `content`), `addUrlSource` (normalise, public-address check, kind `help_center`), `addPasteSource`, `startWebsiteSources(session)` (website and detected help centre, once), `removeSource` (passages, file, `rebuildBrief`), `retrySource`, `listSources`, `signedUrl`.
- `app/api/knowledge/upload/route.ts`: reuse PDF/DOCX/TXT/MD extraction (move it to `server/extract-text.ts` shared with `api/documents/extract-text`).
- Server actions in `app/(app)/knowledge/actions.ts`.

### Task 8: Use the knowledge
- `companyContext()` adds `brief` (compact text, ≤ 2,500 chars); `CompanyContext` type in `packages/ai`.
- Engine `company_context` adds summary, policies, tone and terminology from `organizations.company_brief` (loaded in `loadRun`).
- Discover → Document: the import creates a source too.

### Task 9: Screens
- Components: `AddSources` (drop zone with multiple files, help-centre URL, paste), `SourceList` (status, progress counts, sampled sections, open original, retry, remove; polls every 3 s while any source is processing), `BriefView`.
- `/knowledge` page (sidebar Knowledge, green); onboarding `/onboarding/knowledge` required step between company and connect; `startWebsiteSources` called when the company step completes; Continue enabled when at least one non-website source exists.

### Task 10: Tests and checks
- Unit suites from tasks 1–3, 5; RLS test for passages; E2E: onboarding requires a source, TXT upload becomes ready, Knowledge page lists it, search finds a passage through `knowledge.search_documents` in a test run.
- `pnpm -r typecheck`, lint, build, full Playwright; README section "Company knowledge".
