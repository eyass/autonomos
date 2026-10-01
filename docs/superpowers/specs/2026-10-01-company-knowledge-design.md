# Company knowledge

Date: 2026-10-01. Agreed in chat: every company builds up one knowledge base about itself (support documents, help pages, PDF, DOCX and more) that the app and its agents use. Decisions: search by meaning from the start; keep the original files; onboarding gets its own required step.

## Today

- Website: onboarding reads up to 6 pages into `organizations.website_profile`.
- Documents: Discover → Document imports PDF, DOCX, TXT or MD (10 MB, `unpdf` and `mammoth`) or pasted text into `documents` (whole text, English full-text index), used to extract processes.
- Agents: `knowledge.search_documents` runs full-text search over whole documents, top 5. The agent prompt's `company_context` has only name, industry and description.
- AI tasks get `companyContext()`: name, industry, description, summary and connected systems.
- No file storage; background jobs exist (`background_jobs`, `JobKind`, `job-handlers.ts`).

## Model

- **`knowledge_sources`**: `id, organization_id, kind ('file' | 'paste' | 'url' | 'website'), title, url, file_path, mime, bytes, status ('queued' | 'processing' | 'ready' | 'failed'), error, chars, passages, summary, added_by, created_at, processed_at`. Row level security by organisation, as other tables.
- **`knowledge_passages`**: `id, organization_id, source_id, ordinal, heading, content (≤ ~1,500 chars), search tsvector, embedding vector(768)`. HNSW index on `embedding` (cosine), GIN on `search`.
- **`organizations.company_brief jsonb`** plus `company_brief_at`: `{ summary, offering, customers, policies[], tone, products[], terminology[], teams[], systems[], facts: [{ text, sourceId }] }`.
- **Storage**: a private bucket `knowledge` with path `<organization_id>/<source_id>/<file name>`; read only through signed URLs for members; removed with the source.
- Existing `documents` rows migrate to file sources (text only, no original); `documents` stays for the process-import history until a later cleanup.

## Pipeline (background job `knowledge_source`)

1. **Extract**: PDF (`unpdf`), DOCX (`mammoth`), TXT or MD; URL: fetch the page and same-site links under the same path, up to 50 pages, with the website crawler's public-address and size guards; pasted text as is.
2. **Clean**: drop boilerplate (navigation, repeated footers); remove email addresses and phone numbers (the discovery redaction).
3. **Split** into passages by heading, then by paragraph, at about 1,500 characters with a small overlap.
4. **Embed** passages in batches (`embedPassages`, Gemini `gemini-embedding-001` at 768 dimensions, or OpenAI `text-embedding-3-small` at 768, by `AI_PROVIDER`; Anthropic workspaces use Gemini). Mock mode returns deterministic vectors.
5. **Brief**: an AI pass (SMART model) merges what the source adds into `company_brief`, keeping a source id on every fact; it never removes facts from other sources.
6. Status `ready` with counts and a one-line summary; on failure `failed` with a reason and Retry.

Removing a source deletes its passages and file, then rebuilds the brief from the remaining sources.

## Search

`searchKnowledge(org, query, k = 6)` is a hybrid: cosine similarity on embeddings, plus full-text rank, combined by reciprocal rank fusion. It returns passages with heading, source title and an excerpt. `knowledge.search_documents` uses it, so agents get the exact passage (for example the refund window).

## Where the knowledge is used

- **`companyContext()`** gains the brief (compact), so discovery, interviews, ideas and playbook selection all see it.
- **The agent prompt's `company_context`** gains the brief's summary, policies, tone and terminology; details come from search.
- Passages and the brief are fenced as untrusted data in prompts, as tickets are.

## Screens

- **Onboarding**: a new required step after "Your company", called "Teach AutonomOS about you". It has a file drop area (PDF, DOCX, TXT, MD; 10 MB each; several at once), a help-centre address field, and a paste box. Each source shows its status, and the brief fills in as sources finish. Continue unlocks once at least one source (beyond the website) is added; processing carries on in the background, and a source that fails is flagged on the Knowledge page and Home.
- **Knowledge page** (sidebar, Home group, area colour green): the brief with each fact's source, the source list with status, passage count, open-original (signed URL), retry and remove, and the same add controls.
- Discover → Document becomes "Add to knowledge, and find processes in it" (it creates a source, then extracts processes as now).

## Limits

10 MB per file; 50 pages per URL; 2,000 passages per source; free plan 20 sources. Owners and admins add or remove sources; members read.

## Not now

What connected systems learn (discovery and inventories) feeding the brief; Google Drive and Notion folder sync; scheduled re-reading of URLs.

## Tests

- Unit: splitting and overlap, redaction, rank fusion, the brief merge keeping other sources' facts, mock embeddings.
- DB (RLS): sources and passages invisible across organisations; storage paths per organisation.
- E2E: onboarding requires a source; upload a TXT, see it ready and the brief filled; Knowledge page remove; an agent test run finds a passage through search.
