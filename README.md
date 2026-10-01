# AutonomOS

An AI operating layer for existing businesses. It discovers recurring work, finds what to automate, deploys constrained agents, and measures how autonomous the company is becoming.

**Connect → Discover → Prioritise → Deploy → Execute → Measure → Increase autonomy**

This repository is the V1 described in the PRD: the full loop from company creation to a live refund agent under human approval, with a management dashboard.

## What is in V1

| Area | What works |
| --- | --- |
| Auth and tenancy | Supabase Auth (email and password, magic link, Google), organisations, owner, admin and member roles, invites, row level security on every tenant table, automatic session expiry |
| Onboarding | Agentic: the website is taken from the work email, crawled and profiled (name, industry, size, country, currency, hourly cost, what the company does, improvement areas, tools in use); the user reviews one prefilled form, connects the detected tools, and lands on a drafted process inventory |
| Process discovery | First inventory drafted automatically from the website profile and connected systems; guided AI interview with targeted follow-up questions and one-tap suggested answers, document import (PDF, DOCX, TXT, MD or pasted text), discovery from connected systems, manual creation with AI-generated workflow |
| Processes | Structured inventory with steps, systems, roles, exceptions, confidence and missing information; filters and sorts from the PRD; draft → reviewed → active → archived review flow; inline editing |
| Opportunities | AI generation anchored by deterministic value, difficulty and risk scores; ranking by value × potential ÷ difficulty with risk shown separately; value vs difficulty matrix; before/after flow; required tools, approvals and human involvement |
| Agents | Six-step wizard pre-filled from the opportunity; explicit tool allowlist; autonomy L1 to L5; manual, schedule and integration-event triggers; immutable configuration versions; test runs that simulate every write; activation gated on a completed test |
| Runtime | Durable Trigger.dev task; resumable run engine; deterministic policy engine; idempotent writes; retryable vs non-retryable errors; approval waits that survive deploys |
| Human control | Approval queue with approve, reject and modify; escalations; interventions logged; emergency "Pause all agents" checked before every external write |
| Measurement | Company autonomy score, department autonomy, trend, hours saved, estimated value, AI cost, ROI, cost per task, per-agent success, automation and intervention rates, promotion and downgrade recommendations |
| Transparency | Activity feed with filters, per-run step timeline with tool data, append-only audit log, run feedback (correct or incorrect) |
| Integrations | Sandbox provider for Zendesk, Stripe, Slack and Gmail; Composio provider for live accounts; signed webhook endpoint for integration events |

The showcase workflow is **refund handling** (Zendesk + Stripe). It exercises retrieval, reasoning, a financial action, approvals, policy limits, autonomy levels and measurement.

## Architecture

```
apps/web              Next.js 16 app: pages, server actions, API routes (PRD section 105)
packages/schemas      Zod contracts: processes, opportunities, agent config, decisions, policy
packages/ai           Model classes (FAST, SMART, AGENT), structured output with retries, cost, mock mode
packages/integrations Tool catalog, sandbox provider, Composio provider, error classification
packages/agents       Policy engine, run engine, scoring, metrics, autonomy recommendations
packages/db           Supabase types, service-role run store, run creation, metrics
packages/workflows    Trigger.dev tasks: agent-run, approval-expiry, metrics-snapshot, agent-schedule
supabase/migrations   Schema, RLS, append-only audit, immutable agent versions, integration catalog
```

### How a run works

1. A trigger (manual, schedule, webhook or sandbox ticket) creates an `agent_runs` row pinned to an `agent_version_id` and enqueues the `agent-run` task on Trigger.dev.
2. The engine asks the agent model for one `AgentDecision` at a time. The prompt separates system rules, company and process context, policy, tools and run history. Tool output and tickets are fenced as untrusted data.
3. Reads execute directly. Every proposed write goes through `evaluatePolicy`, which runs in code and returns allow, require approval, draft (L2), simulate (test run) or deny. The model's confidence and requests can make an action stricter, never looser.
4. A write that needs approval is persisted with its idempotency key, an approval request is created, and the task ends. Approving, rejecting or modifying enqueues a resume. Hard limits, the allowlist and the emergency pause are re-checked after approval.
5. Allowed writes are persisted before they execute. A retry after a crash re-executes the same action with the same key instead of asking the model again, so a refund can never be issued twice.
6. On completion the run records outcome, human minutes, time saved (baseline minus interventions), tokens and cost.

### Agentic setup

AutonomOS asks for as little as possible and drafts the rest for review:

1. **Website from email.** A work email (not Gmail, Outlook and the like) gives the company domain, and onboarding starts reading it immediately.
2. **Crawl** (`packages/integrations/src/website.ts`). The homepage plus up to five pages that say the most about a company (about, product, pricing, careers, support, integrations), chosen by path and link text with one page per kind first. It also reads JSON-LD organisation data, detects tools from script signatures (Zendesk, Intercom, HubSpot, Salesforce, Stripe, Slack, Notion and more) and reads the mail provider from MX records (Google Workspace or Microsoft 365). Every URL and redirect hop must resolve to a public address; responses are capped in size and time.
3. **Profile** (`profileCompany`, SMART model). Name, summary, industry, headcount band, country, currency, a typical hourly labour cost, improvement areas and likely processes, each with its evidence. Fields the site does not support stay empty.
4. **Review, not typing.** One prefilled form; the detected tools are listed first on the connect step.
5. **First inventory** (`draftProcessInventory`). When onboarding finishes, the likely processes and the evidence from connected systems become draft processes (confidence at most 0.6, missing information listed). Duplicates across discovery sources are kept once.
6. **Downstream.** Approving a process generates its automation opportunities; "Build and test agent" creates the proposed agent and starts a simulated test in one click; the interview offers suggested answers; a manually added process only needs a name and a sentence (department, steps and volume are inferred); Settings can refresh the profile from the website.

### Adding systems

Integrations → "Add systems" (and the same button in onboarding) lists 20 popular systems first (Gmail, Google Calendar, Outlook, Slack, Teams, Stripe, HubSpot, Salesforce, Zendesk, Intercom, Notion, Google Drive, Google Sheets, Facebook, Instagram, LinkedIn, Jira, Asana, Airtable, Mailchimp). Systems the workspace has already connected are left out and replaced by the next most common ones (`POPULAR_BACKFILL`: Google Docs, OneDrive, Zoom, Google Meet, QuickBooks, Trello and so on). Category chips (Customer support, Sales & CRM, Finance & accounting, Marketing, E-commerce, Email & chat, Documents & files, Projects & tasks, Calendar & scheduling, HR & recruiting, Forms & surveys, Analytics & data, IT & developer) fold Composio's 80-odd categories into groups a business person recognises (`DIRECTORY_GROUPS`). Search covers the whole Composio directory (about 1,500 toolkits, cached for an hour, `packages/integrations/src/directory.ts`). Connecting one adds it to the workspace (`integrations.source = 'directory'`) and opens its sign-in. Toolkits without Composio-managed sign-in show "Needs setup": add an auth config in Composio and list it in `COMPOSIO_AUTH_CONFIGS`.

### Discovery from connected systems

Discover → "From your systems" reads a recent sample from every connected system and proposes the recurring work it shows. It runs on its own when the page opens and there is no result from the last day. The run happens on the server (`after()` in `startDiscoveryAction`, within the page's 300-second limit) and writes progress to `discovery_runs` after every system; the page only polls it, so closing or reloading the browser does not stop it and a reload picks the run back up. A run that has not moved for six minutes is shown as interrupted and can be started again.

- **What is read, and how far back:** every system is read for the last 30 days, capped per system so a busy account stays fast:

  | System | Window | Cap | Composio action |
  | --- | --- | --- | --- |
  | Gmail | 30 days, sampled evenly in 5 slices (promotions and social excluded), plus Gmail's count of the total | 250 messages | `GMAIL_FETCH_EMAILS` |
  | Outlook | 30 days, sampled evenly in 5 slices | 250 messages | `OUTLOOK_OUTLOOK_LIST_MESSAGES` |
  | Google Calendar | 30 days, every page, recurring events expanded | 250 events | `GOOGLECALENDAR_EVENTS_LIST` |
  | Zendesk | 30 days | 100 tickets | `ZENDESK_LIST_ZENDESK_TICKETS` |
  | Stripe | 30 days | 100 charges plus refunds | `STRIPE_LIST_CHARGES`, `STRIPE_LIST_REFUNDS` |
  | Slack | 30 days, 6 busiest channels | 150 messages | `SLACK_LIST_ALL_CHANNELS`, `SLACK_FETCH_CONVERSATION_HISTORY` |
  | Microsoft Teams | 30 days, 10 chats | 100 messages | `MICROSOFT_TEAMS_CHATS_GET_ALL_CHATS`, `..._GET_ALL_MESSAGES` |
  | HubSpot | 30 days | 100 tickets and deals | `HUBSPOT_LIST_TICKETS`, `HUBSPOT_HUBSPOT_LIST_DEALS` |
  | Salesforce | 30 days | 100 cases and opportunities | `SALESFORCE_EXECUTE_SOQL_QUERY` |
  | Jira | 30 days | 100 issues | `JIRA_SEARCH_FOR_ISSUES_USING_JQL_GET` |
  | Google Drive | 30 days, sampled evenly in 5 slices | 150 files | `GOOGLEDRIVE_LIST_FILES` |
  | Notion | 30 days, most recently edited first, every page | 100 pages | `NOTION_SEARCH_NOTION_PAGE` |
  | Intercom | 30 days | 100 conversations | `INTERCOM_LIST_CONVERSATIONS` |
  | Anything else (Asana: 100) | 30 days | 50 items | up to two read-only list actions picked from the toolkit, followed page by page |

  Limits live in `SCAN_LIMITS` and `DEFAULT_SCAN_LIMIT` (`packages/integrations/src/scan.ts`). Sandbox systems get a month of fictional history the first time they are read. Systems whose toolkit has no suitable read action are shown as "cannot read this system for discovery yet".
- **Privacy:** only subjects, short snippets, tags, dates and amounts are kept. Email addresses become their domain; phone numbers and IBANs are removed before anything reaches the model. The redacted sample is deleted once proposals are made; a run keeps counts and proposals (`discovery_runs`).
- **One analyst per system (Viktor-style):** every connected system is read on its own terms by its own model pass, with a playbook for that kind of system (inbox, support desk, payments, calendar, chat, CRM, documents, projects; `playbookFor`). Each finds recurring work people do by hand and improvements the data shows nobody handles (backlogs, leaks, missed follow-ups), up to 12 per system, and says what an agent would do and when. A cross-system pass looks for work that starts in one system and continues in another, and a coverage pass adds likely work by department (confidence at most 0.45, not preselected). All passes run side by side; one failing system does not stop the run. An analyst pass looks at every connected system, including ones that cannot be read yet, and proposes recurring analyses that end in recommendations to a named person: a weekly ad-spend review with concrete changes, a weekly business review from the warehouse, revenue and refund trends, pipeline and support trends (kind `improvement`, confidence 0.55). BigQuery is read for its shape only (tables, columns, row counts, last update from `INFORMATION_SCHEMA`), never its rows. Every pass skips trivial work worth less than about an hour a month. A combining pass then turns findings from different systems that are parts of the same work (the same customer, order, deal or case, or one step feeding the next) into one end-to-end process across those systems, with one agent doing all of it; the single-system findings it absorbs are dropped, and processes that span several systems go first. Results are deduplicated and interleaved by system, so a busy inbox cannot fill the top of the list (at most 60, `DISCOVERY_LIMITS`).
- **Review, one at a time:** proposals are shown one by one, evidenced first: "Add to inventory" saves it as a draft, "Not something we do" rejects it, "Decide later" moves it to the end (keys: left, right, down). Rejections are stored per workspace (`rejected_processes`) and passed to every later discovery run and the first inventory, which never propose them or a rewording of them again. A rejection can be undone straight away or restored from the summary.
- **Output:** each proposal carries evidence ("5 of 15 tickets are about order status") and a volume estimate scaled from the sample. Accepted proposals become draft processes with a "Found in your systems" card and a "What an agent would do" card (`processes.proposed_automation`), which opportunity generation builds on.
- **Interview:** the guided interview opens with what the systems showed for that department and asks about what the data cannot show.

### Company knowledge

Everything AutonomOS knows about how a company works, built up from every source it is given (Knowledge in the sidebar; a required onboarding step, "Teach AutonomOS about you").

- **Sources:**
  - the **whole website**, started automatically when onboarding knows it;
  - the **help centre**, found on the site (help paths and subdomains, hosted Zendesk, Intercom, Freshdesk, HelpScout, GitBook and Notion help centres) or typed in;
  - **files** (PDF, DOCX, TXT or MD, up to 10 MB; originals kept in the private `knowledge` bucket);
  - **pasted text**;
  - documents imported on Discover.
- **Reading** (`packages/integrations/src/site-reader.ts`, `packages/db/src/knowledge.ts`, worker task `knowledge-ingest`):
  - **Breadth first:** every level-1 page is read before anything deeper.
  - **Ordering:** within a level, help, policy, pricing and about pages go first.
  - **Never fetched:** log in, sign up, account, cart, checkout, search, tag and archive pages, assets, robots.txt disallows.
  - **Sampled:** large repeated sections (`/listings/123`) are sampled at 10 pages.
  - **Speed:** 8 requests at a time.
  - **Caps:** 1,000 website pages and 2,000 help articles.
  - **Resumable:** a read saves its place and resumes in the next round.
- **Passages:** about 1,500 characters under their headings, emails, phone numbers and IBANs removed, embedded at 768 dimensions (Gemini `gemini-embedding-001`, or OpenAI `text-embedding-3-small`; a deterministic stand-in without keys).
- **Search:** `match_knowledge` combines nearest-by-meaning and full-text matches (reciprocal rank fusion). Agents use it through `knowledge.search_documents`.
- **Brief** (`organizations.company_brief`): summary, offering, customers, policies with their numbers, tone, terms, teams, systems and facts, each with its source. It is merged one source at a time and rebuilt when a source is removed. It goes into every AI task (`companyContext().knowledge`) and every agent prompt (`company_knowledge`, fenced as data).

### Autonomy score

`Σ(process monthly minutes × coefficient) / Σ(process monthly minutes)` with L1 0, L2 0.2, L3 0.4, L4 0.75, L5 1. A process counts at the level of its best active agent.

## Brand

- **Product copy never names the stack.** Screens, errors, docs and the security page describe what happens ("runs keep going through restarts", "our connection partner holds sign-in tokens") without naming vendors. The one exception is the subprocessor table on the privacy and security pages, which is a legal disclosure.

- **Brand teal `#0F766E`** (`--brand`, also `--primary`): logo, primary buttons, links, focus rings, active navigation, the autonomy score.
- **Area colours** (`--area-green|blue|violet|amber|rose`, each with `-soft` and `-strong`): one per part of the product so each is recognisable at a glance: Home green, Work blue, Playbooks amber, History violet, Agents brand teal, Inbox signal orange. Used for icon tiles, tinted stat tiles, department bars and chart series, never for buttons or text links. `components/app/area.ts` holds the class sets.
- **Signal orange `#E8552D`** (`--highlight`): agent and AI activity and anything that needs attention: the pending-approvals count, AI-drafted alerts (`<Alert variant="agent">`), running and live states (`<Badge variant="agent">`), agent entries in Activity. Use `--highlight-strong` (`#B53D17`) for orange text on light backgrounds. Keep it rare so it keeps its meaning.
- **Type:** Bricolage Grotesque for headings, card titles and big numbers (`font-display`); Instrument Sans for text; JetBrains Mono for IDs and code.
- **Mark:** `components/brand/logo.tsx`, a teal tile with an open "A" and an orange signal dot.

## Running locally

Requirements: Node 22, pnpm 10, Docker.

```bash
pnpm install
cp .env.example .env.local          # at the repository root; every package reads it
pnpm db:start                        # local Supabase; copy the printed keys into .env.local
pnpm db:seed:demo                    # optional demo company, see below
pnpm dev                             # http://localhost:3000
```

### Running agents (Trigger.dev)

Agents only run on the durable runtime. Without `TRIGGER_SECRET_KEY` the app refuses to start runs and says so. The project (`proj_xytjychoihbtmbxoztql`) is set in `packages/workflows/trigger.config.ts`; tasks live in `packages/workflows/src/trigger`.

1. Put your dev secret key in `.env.local` as `TRIGGER_SECRET_KEY`.
2. `npx trigger.dev@latest login` once, then `pnpm trigger:dev`. The script loads the root `.env.local` into the worker, because `trigger dev` only reads env files from its own directory.
3. Deploy with `pnpm --filter @autonomos/workflows deploy`. It passes the root `.env.local` to the CLI and the `syncEnvVars` build extension copies the runtime variables (Supabase, model, Composio and email keys) into the Trigger.dev environment. Deploy from an env file that holds production values, not your local Supabase URL. Set the production `TRIGGER_SECRET_KEY` in your web host (for example Vercel).

### Models

Gemini is the default provider. Set `GOOGLE_GENERATIVE_AI_API_KEY`. Defaults: FAST `gemini-3.5-flash-lite`, SMART and AGENT `gemini-3.8-flash`. Override any class with `AI_FAST_MODEL`, `AI_SMART_MODEL` or `AI_AGENT_MODEL`, or switch provider with `AI_PROVIDER=anthropic` (Claude) or `AI_PROVIDER=openai`. Without a key, every AI step runs in a deterministic mock mode that follows the refund template, so the whole product works offline. Settings → Execution shows a plain ready / not ready checklist; admins can open Technical details to see which models are in use.

Measured on Gemini 3.8 Flash: a full refund run (read ticket, find customer, payments and refunds, refund, reply, close) takes about 26 seconds and costs about $0.036; discovery, opportunity and agent drafting together cost about $0.03.

Costs are recorded per call from a price table in `packages/ai/src/models.ts` (Gemini paid tier as of 2026-09-26, Anthropic list prices). Gemini 3.7 and 3.8 Flash prices are introductory and double on 2027-01-01. Override or add models with `AI_MODEL_PRICING`. OpenAI models have no built-in price table, so their cost records as 0 until you add one.

### Integrations

Every integration can connect in **sandbox** mode, backed by the `sandbox_records` table with realistic customers, payments and refund history. With `COMPOSIO_API_KEY`, the Connect button starts a Composio OAuth flow for the live account. The Composio action slugs and argument names for Zendesk, Stripe, Slack and Gmail were checked against the live Composio catalog and toolkit versions are pinned in `packages/integrations/src/providers.ts`.

**Ready-made playbooks.** Site administrators, listed by email in `PLATFORM_ADMIN_EMAILS`, see a Playbook studio at `/admin/playbooks`. AI drafts tool-neutral playbooks (one at a time for a department or goal, or a starter library across departments): each step names the kind of system it works in (help desk, payments, CRM and so on, see `packages/integrations/src/capabilities.ts`), never a product. The administrator edits and publishes them. In a workspace (`/playbooks`), each kind of system is filled with one of the workspace's connected tools, or connected right there; AI then picks that tool's actions for each step. Starting adds the process, the compliance owner and policy numbers where the work needs them, and an automation idea whose agent goes through the usual test and activation gates.

Integration events arrive at `POST /api/webhooks/:connectionId` with `X-AutonomOS-Signature: sha256=<HMAC of the body>`. The URL and secret are shown to admins on the Integrations page.

## Production (Vercel + Supabase + Trigger.dev)

- **Web app:** the Vercel project `autonom` (Root Directory `apps/web`) deploys `main` to https://autonom-ten.vercel.app. Supabase is connected through the Vercel integration.
- **Database:** every production build runs `apps/web/scripts/migrate.mjs` before `next build`. It applies pending migrations with `supabase db push`, using `POSTGRES_URL_NON_POOLING` from the integration. Preview builds skip it.
- **Worker:** `.github/workflows/trigger-deploy.yml` deploys `packages/workflows` to Trigger.dev on pushes to `main` once these repository secrets exist: `TRIGGER_ACCESS_TOKEN` (a Trigger.dev personal access token), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` and optionally `COMPOSIO_API_KEY`. The deploy syncs them into the Trigger.dev production environment.
- **Connecting the two:** set `TRIGGER_SECRET_KEY` in Vercel to the Trigger.dev **production** secret key (`tr_prod_...`), so the app enqueues runs where the deployed worker listens.
- **Readiness gate:** tests and activation are blocked until the runtime is connected, the systems an agent uses are connected and (for activation) someone can approve and a test has finished. A run that cannot be enqueued is recorded as failed with the reason and appears in Activity, instead of sitting in "queued".
- **Previews:** Supabase variables exist only for Production. A preview deployment without them returns a 503 page that says so instead of crashing. Previews are also behind Vercel Deployment Protection; before an external review, share a Protection Bypass link (Project → Settings → Deployment Protection) or review on the production URL.
- **Public pages:** signed-out visitors at `/` see the landing page. `/security`, `/docs`, `/terms` and `/privacy` are public. Terms and Privacy are drafts and need legal review before real customers sign up.
- **Auth redirects:** in Supabase → Authentication → URL Configuration, set the Site URL to the production URL and add `https://autonom-ten.vercel.app/auth/callback**` to the redirect URLs. The wildcard matters: password reset links go to `/auth/callback?next=/reset-password`.

## Setting up the services (step by step)

Do these in order. Each step says where the value goes. Vercel variables go in Project `autonom` → Settings → Environment Variables, target **Production**, then redeploy.

1. **Supabase (done).** Connected through the Vercel integration. In Supabase → Authentication → URL Configuration, set the Site URL to `https://autonom-ten.vercel.app` and add `https://autonom-ten.vercel.app/auth/callback**` to the redirect URLs.
2. **Gemini (done).** `GOOGLE_GENERATIVE_AI_API_KEY` and `AI_PROVIDER=google` are set.
3. **Trigger.dev (required for any agent run).**
   1. In the Trigger.dev dashboard, open project `proj_xytjychoihbtmbxoztql` → API keys and copy the **Production** secret key (`tr_prod_...`).
   2. Add it to Vercel as `TRIGGER_SECRET_KEY`.
   3. Create a personal access token (Account → Tokens).
   4. In GitHub → repository → Settings → Secrets and variables → Actions, add `TRIGGER_ACCESS_TOKEN` (the token), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` and `COMPOSIO_API_KEY` (production values). Under the Variables tab, add `NEXT_PUBLIC_APP_URL=https://autonom-ten.vercel.app` so links in emails sent by the worker point at the app.
   5. Merge to `main` or run the "Deploy Trigger.dev worker" workflow by hand. It deploys the worker and syncs those values into Trigger.dev.
   6. Check Settings → Execution in the app. "Agent runtime" turns green.
4. **Composio (live Zendesk, Stripe, Slack, Gmail).**
   1. `COMPOSIO_API_KEY` is already set in Vercel. Add the same key as a GitHub secret (step 3.4) so the worker can call tools.
   2. In the app, Integrations → a system → Connect → "Connect account". AutonomOS uses the Composio-managed auth config for that toolkit and creates one if none exists.
   3. If Composio has no managed auth for a toolkit (Zendesk usually needs your subdomain), create an auth config in the Composio dashboard (Auth configs → New → pick the toolkit, fill in the fields), copy its id (`ac_...`) and set `COMPOSIO_AUTH_CONFIGS={"zendesk":"ac_..."}` in Vercel.
   4. Connected accounts show as "Live" in Settings → Environment and in the header badge.
5. **Email notifications (optional).** Create a Resend account, verify your sending domain, then set `RESEND_API_KEY` and `EMAIL_FROM` (for example `AutonomOS <notifications@yourdomain.com>`) in Vercel **and** as GitHub secrets (approval emails are sent by the worker). Without them, notifications are in-app only.
6. **Product analytics (optional).** Set `POSTHOG_KEY` (and `POSTHOG_HOST` if not the US cloud).
7. **Previews (optional).** Previews have no Supabase variables and show a 503 page. To use them, add Preview-target copies pointing at a separate Supabase project, never at production.
8. **Contact addresses.** `apps/web/src/components/marketing/config.ts` holds `CONTACT_EMAIL` and `SECURITY_EMAIL`. Change them to mailboxes you own.

## Platform features

- **Sample workspace.** "Explore a sample workspace" (Overview or the account menu) creates a fictional company with sandbox systems and a Refund Agent. When the runtime is connected the agent really runs on three sample tickets: one routine refund, one that waits for approval, one prompt-injection attempt that is escalated. A banner marks the workspace as sample data.
- **Workspaces.** The account menu lists every workspace you belong to and switches between them. "New workspace" starts onboarding for another company.
- **API keys.** Settings → Developers. Keys are shown once and stored as SHA-256 hashes. A key acts as the admin who created it. See `/docs/api`.
- **Webhook signing secrets.** Per connection on the Integrations page, with rotation.
- **Approval limits.** Settings → Members: the largest amount each approver may approve.
- **Plans.** `PLANS` in `packages/schemas`. Live-agent limits are enforced on activation; runs above the allowance keep working and count as overage. Invoices are rows in the `invoices` table and appear in Settings → Billing.

## The 10-minute demo

After `pnpm db:seed:demo`, sign in as `demo@autonomos.local` / `autonomos-demo`. The seed contains a company, reviewed processes, sandbox Zendesk, Stripe and Slack, and the approved Refund Agent opportunity. No runs or metrics are fabricated.

1. Opportunities → Refund Agent → Create agent → step through the wizard.
2. Run test → the run page lists every step and the approvals production would need.
3. Activate agent → Send ticket (routine €72 refund).
4. Approvals → Approve. The refund executes in the sandbox Stripe and the customer gets a reply.
5. Overview shows the live agent, the autonomy score and time saved.

Try the other sample tickets: the €240 one asks for approval even at L4 because the customer had a recent refund; the suspicious one contains instructions aimed at the agent and is escalated without any action.

## Tests

```bash
pnpm typecheck                               # all packages
pnpm test                                    # policy engine, run engine, scoring (Vitest)
pnpm --filter @autonomos/db test:integration # RLS isolation and the run engine on the real schema (needs pnpm db:start)
pnpm test:e2e                                # Playwright: the full demo loop in a browser
```

The Playwright suite points the SDK at a local Trigger.dev test double (`apps/web/e2e/trigger-stub.ts`) that executes the same `executeRun` code the real task runs, so no runs land in a real Trigger.dev account.

## Security model

- Every customer-owned table has `organization_id` and RLS. Runtime tables (runs, actions, approvals, interventions, activity) are read-only for users; they are written by server code after membership and role checks, so an approval cannot be resolved from the browser.
- OAuth tokens live in Composio; the database stores only the connected account id. Webhook secrets sit in a table with no RLS policies, readable by the service role only.
- Audit events are append-only and agent versions are immutable, both enforced by triggers.
- Financial and other high-risk actions need approval by default. Hard limits deny even after approval.
- Basic per-user rate limiting on AI endpoints and per-connection limiting on webhooks (per server instance).

## Known limits

- The Trigger.dev worker was not run in the build environment (the CLI needs an interactive login). The task files bundle cleanly with esbuild and the task code is exercised through the engine tests and the Playwright test double. One enqueue against the real Trigger.dev API succeeded.
- The Composio provider has not executed actions against live Zendesk or Stripe accounts; slugs and argument names are verified, response parsing is defensive.
- The rate limiter is in memory per instance.
- Microsoft sign-in, Slack approvals, reusable organisation-wide policies and the lead qualification and weekly reporting templates are not built yet. The run engine and tool catalog support them.
