# Company knowledge

Date: 2026-10-01. Agreed in chat: every company builds up one knowledge base about itself (support documents, help pages, PDF, DOCX and more) that the app and its agents use. Decisions: search by meaning from the start; keep the original files; onboarding gets its own required step.

## Today

- Website: onboarding reads up to 6 pages into `organizations.website_profile`.
- Documents: Discover → Document imports PDF, DOCX, TXT or MD (10 MB, `unpdf` and `mammoth`) or pasted text into `documents` (whole text, English full-text index), used to extract processes.
- Agents: `knowledge.search_documents` runs full-text search over whole documents, top 5. The agent prompt's `company_context` has only name, industry and description.
- AI tasks get `companyContext()`: name, industry, description, summary and connected systems.
- No file storage; background jobs exist (`background_jobs`, `JobKind`, `job-handlers.ts`).

## Model

- **`knowledge_sources`**: `id, organization_id, kind ('file' | 'paste' | 'url' | 'website' | 'help_center'), title, url, file_path, mime, bytes, status ('queued' | 'processing' | 'ready' | 'failed'), error, chars, pages, passages, summary, crawl jsonb (frontier, visited, counts, for a read that runs in rounds), added_by, created_at, processed_at`. Row level security by organisation, as other tables.
- **`knowledge_passages`**: `id, organization_id, source_id, ordinal, heading, content (≤ ~1,500 chars), search tsvector, embedding vector(768)`. HNSW index on `embedding` (cosine), GIN on `search`.
- **`organizations.company_brief jsonb`** plus `company_brief_at`: `{ summary, offering, customers, policies[], tone, products[], terminology[], teams[], systems[], facts: [{ text, sourceId }] }`.
- **Storage**: a private bucket `knowledge` with path `<organization_id>/<source_id>/<file name>`; read only through signed URLs for members; removed with the source.
- Existing `documents` rows migrate to file sources (text only, no original); `documents` stays for the process-import history until a later cleanup.

## Reading the whole website

Onboarding keeps its quick 6-page read for the profile (so the profile still appears in seconds). As soon as the company's website is known, a full read starts in the background as its own sources:

1. **Find every page**: `robots.txt` and every sitemap it lists, all sitemap indexes (including blog, product and article sitemaps the profile read skips), plus links found on each page (breadth first, same site only).
2. **Find the help centre**: look for a help section and treat it as its own source, "Help centre", so its articles are kept apart from marketing pages. It is found from:
   - help paths on the site (`/help`, `/support`, `/faq`, `/kb`, `/knowledge-base`, `/hc/`, `/docs`, `/support/solutions`);
   - help subdomains (`help.`, `support.`, `docs.`, `faq.`, `kb.`);
   - hosted help centres the site links to (Zendesk `*.zendesk.com/hc`, Intercom `intercom.help`, Freshdesk `*.freshdesk.com/support`, HelpScout `*.helpscoutdocs.com`, Notion and GitBook pages);
   - the help-desk script detection the crawler already does (a Zendesk or Intercom widget means a help centre likely exists).
3. **Read politely**: respect `robots.txt` disallow rules for our user agent; 4 requests at a time per host; the crawler's existing guards (public addresses only, size and time caps per page); skip assets, login, cart, checkout, account and search pages, tracking parameters and duplicates (canonical URL, identical text); one language version when the site has several (the one matching the home page).
4. **Keep what says something**: pages with real text after removing navigation and footers; script-rendered pages that return no text are counted and listed as "could not be read" rather than silently dropped.
5. **Rounds**: a read can run past the 5-minute job limit, so each round reads up to 4 minutes or 150 pages, saves its frontier and visited set on the source (`crawl`), and queues the next round. Progress (pages found, read, skipped) shows on the source.
6. **Caps**: website 1,000 pages and help centre 2,000 articles per source (so a large site is still read in full in most cases); anything beyond is listed as not read.

A help-centre address typed in by hand uses the same reader, starting from that address.

## Pipeline (background job `knowledge_source`)

1. **Extract**: PDF (`unpdf`), DOCX (`mammoth`), TXT or MD; websites and help centres through the reader above; pasted text as is.
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

10 MB per file; website 1,000 pages and help centre 2,000 articles per source; 5,000 passages per source; free plan 20 sources (the website and help centre count as one each). Owners and admins add or remove sources; members read.

## Not now

What connected systems learn (discovery and inventories) feeding the brief; Google Drive and Notion folder sync; scheduled re-reading of websites (a manual "Read again" is in); pages that need a browser to render (listed, not read).

## Tests

- Unit: splitting and overlap, redaction, rank fusion, the brief merge keeping other sources' facts, mock embeddings; help-centre detection from paths, subdomains and hosted platforms; robots rules; skip rules and canonical de-duplication; round state carried between rounds.
- DB (RLS): sources and passages invisible across organisations; storage paths per organisation.
- E2E: onboarding requires a source; upload a TXT, see it ready and the brief filled; Knowledge page remove; an agent test run finds a passage through search.
