# AutonomOS

An AI operating layer for existing businesses. It discovers recurring work, finds what to automate, deploys constrained agents, and measures how autonomous the company is becoming.

**Connect → Discover → Prioritise → Deploy → Execute → Measure → Increase autonomy**

This repository is the V1 described in the PRD: the full loop from company creation to a live refund agent under human approval, with a management dashboard.

## What is in V1

| Area | What works |
| --- | --- |
| Auth and tenancy | Supabase Auth (email and password, magic link, Google), organisations, owner, admin and member roles, invites, row level security on every tenant table, automatic session expiry |
| Onboarding | Create company, company context and improvement areas, connect systems (nothing mandatory) |
| Process discovery | Guided AI interview with targeted follow-up questions, document import (PDF, DOCX, TXT, MD or pasted text), discovery from connected systems, manual creation with AI-generated workflow |
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

Agents only run on the durable runtime. Without `TRIGGER_SECRET_KEY` the app refuses to start runs and says so.

1. Set `TRIGGER_SECRET_KEY` (dev key) and `TRIGGER_PROJECT_REF` in `.env.local`.
2. `npx trigger.dev@latest login` once, then `pnpm trigger:dev` to run the worker locally.
3. For production, `pnpm --filter @autonomos/workflows deploy` and set the same environment variables in Trigger.dev (Supabase URL, service role key, model and Composio keys).

### Models

Set `ANTHROPIC_API_KEY`. Defaults: FAST `claude-haiku-4-5`, SMART and AGENT `claude-opus-5`. Override with `AI_FAST_MODEL`, `AI_SMART_MODEL`, `AI_AGENT_MODEL`, or switch provider with `AI_PROVIDER=openai`. Without a key, every AI step runs in a deterministic mock mode that follows the refund template, so the whole product works offline. Settings shows which mode is active.

Costs are recorded per call using Anthropic list prices (Haiku 4.5 $1 / $5, Opus 5 $5 / $25 per million input / output tokens, cache reads at 0.1× input). Add other models with `AI_MODEL_PRICING`. OpenAI models have no built-in price table, so their cost records as 0 until you add one.

### Integrations

Every integration can connect in **sandbox** mode, backed by the `sandbox_records` table with realistic customers, payments and refund history. With `COMPOSIO_API_KEY`, the Connect button starts a Composio OAuth flow for the live account. The Composio action slugs and argument names for Zendesk, Stripe, Slack and Gmail were checked against the live Composio catalog and toolkit versions are pinned in `packages/integrations/src/providers.ts`.

Integration events arrive at `POST /api/webhooks/:connectionId` with `X-AutonomOS-Signature: sha256=<HMAC of the body>`. The URL and secret are shown to admins on the Integrations page.

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

- The Trigger.dev worker was not run in the build environment (it needs a personal access token and project ref); the task code is exercised through the engine tests and the Playwright test double. One enqueue against the real Trigger.dev API succeeded.
- The Composio provider has not executed actions against live Zendesk or Stripe accounts; slugs and argument names are verified, response parsing is defensive.
- The rate limiter is in memory per instance.
- Microsoft sign-in, Slack approvals, reusable organisation-wide policies and the lead qualification and weekly reporting templates are not built yet. The run engine and tool catalog support them.
