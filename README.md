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

### Discovery from connected systems

Discover → "From your systems" reads a recent sample from every connected system and proposes the recurring work it shows. It runs on its own when the page opens and there is no result from the last day.

- **What is read:** Gmail messages from the last 30 days (promotions and social excluded), the latest Zendesk tickets, recent Stripe charges and refunds, and the busiest Slack channels. It works on live accounts through Composio (`GMAIL_FETCH_EMAILS`, `ZENDESK_LIST_ZENDESK_TICKETS`, `STRIPE_LIST_CHARGES`, `STRIPE_LIST_REFUNDS`, `SLACK_LIST_ALL_CHANNELS`, `SLACK_FETCH_CONVERSATION_HISTORY`) and on sandbox systems, which get a month of fictional history the first time they are read.
- **Privacy:** only subjects, short snippets, tags, dates and amounts are kept. Email addresses become their domain; phone numbers and IBANs are removed before anything reaches the model. The redacted sample is deleted once proposals are made; a run keeps counts and proposals (`discovery_runs`).
- **Output:** each proposal carries evidence ("5 of 15 tickets are about order status") and a volume estimate scaled from the sample. Accepted proposals become draft processes with a "Found in your systems" card.
- **Interview:** the guided interview opens with what the systems showed for that department and asks about what the data cannot show.

### Autonomy score

`Σ(process monthly minutes × coefficient) / Σ(process monthly minutes)` with L1 0, L2 0.2, L3 0.4, L4 0.75, L5 1. A process counts at the level of its best active agent.

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
