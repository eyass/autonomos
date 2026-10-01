import { JobButton } from "@/components/app/job";
import { latestJob } from "@/server/jobs";
import { snapshotMetrics } from "@autonomos/db";
import { reconcileStuckRuns } from "@/server/run-health";
import { agentStates } from "@/server/readiness";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { hours, money, num, pct, aiMoney } from "@/lib/format";
import { adminDb, requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { AutonomyTrend } from "./trend";
import { InfoTip } from "@/components/app/info-tip";
import { ButtonLink } from "@/components/app/button-link";
import { PageHeader } from "@/components/app/page-header";
import { RowLink } from "@/components/app/row-link";
import { StatStrip } from "@/components/app/stat-card";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Home" };

export default async function OverviewPage() {
  const session = await requireSession();
  const sampleJob = await latestJob({ userId: session.user.id, organizationId: session.org.id, kind: "sample_workspace" });
  await reconcileStuckRuns(session.org.id);
  const db = adminDb();
  // Recompute and store today's snapshot so the trend always includes today.
  const m = await snapshotMetrics(db, session.org.id);
  const supabase = await createClient();
  const [{ data: trend }, { data: movers }, { data: top }, { count: ideasEver }] = await Promise.all([
    supabase.from("metrics").select("period, metric, value").eq("organization_id", session.org.id).in("metric", ["autonomy_score", "autonomy_live"]).eq("dimension", "").order("period").limit(730),
    // What moves the score: agents going live, changing level or pausing, and newly mapped work.
    supabase
      .from("activity_events")
      .select("id, title, occurred_at")
      .eq("organization_id", session.org.id)
      .in("action_type", ["agent_activated", "autonomy_changed", "agent_paused", "processes_mapped"])
      .order("occurred_at", { ascending: false })
      .limit(3),
    supabase
      .from("automation_opportunities")
      .select("id, title, estimated_hours_saved_monthly, automation_difficulty_score, target_autonomy_level, processes(title)")
      .eq("organization_id", session.org.id)
      .in("status", ["suggested", "reviewing", "approved"])
      .order("opportunity_score", { ascending: false })
      .limit(5),
    // Any idea at all, so an empty list can say whether ideas are still to come or all handled.
    supabase.from("automation_opportunities").select("id", { count: "exact", head: true }).eq("organization_id", session.org.id),
  ]);

  // The path to a first live agent, shown until it is walked. Each step links to where it is done.
  const [{ count: connections }, { count: reviewed }, { data: firstDraft }, { data: buildingAgent }, agents] = await Promise.all([
    db.from("integration_connections").select("id", { count: "exact", head: true }).eq("organization_id", session.org.id).eq("status", "connected"),
    db.from("processes").select("id", { count: "exact", head: true }).eq("organization_id", session.org.id).in("status", ["reviewed", "active"]),
    db.from("processes").select("id").eq("organization_id", session.org.id).eq("status", "draft").order("created_at").limit(1).maybeSingle(),
    db.from("agents").select("id").eq("organization_id", session.org.id).in("status", ["draft", "testing"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    // The same agent states as the agent list, the agent page and Settings.
    agentStates(session),
  ]);
  // "Test an agent" is done by a passed test on real input, not by any finished run; "Activate it"
  // appears only for an agent that is actually eligible, otherwise the step leads to its blockers.
  const waiting = agents.filter((a) => a.status !== "active");
  const passedTest = agents.some((a) => a.state.readiness.checks.some((c) => c.key === "test" && c.ok));
  const eligible = waiting.find((a) => a.state.canActivate);
  const blocked = waiting.find((a) => a.firstBlocker);
  // Each step opens the exact thing to act on, not just the list it is in.
  const topOpportunity = (top ?? [])[0]?.id;
  const playbook = [
    { done: (connections ?? 0) > 0, title: "Connect a system", detail: "Sandbox data is fine to start.", href: "/integrations", cta: "Connect" },
    { done: m.processesMapped > 0, title: "Map your processes", detail: "Review what AutonomOS drafted, or run a short interview.", href: "/discover", cta: "Discover" },
    {
      done: (reviewed ?? 0) > 0,
      title: "Approve one process",
      detail: "Approving finds ideas for automating it.",
      href: firstDraft ? `/processes/${firstDraft.id}` : "/processes?status=draft",
      cta: "Review a draft",
    },
    {
      done: m.opportunities > 0 || m.activeAgents > 0,
      title: "Pick an automation idea",
      detail: "Ranked by value, difficulty and risk.",
      href: topOpportunity ? `/opportunities/${topOpportunity}` : "/opportunities",
      cta: "Open the top one",
    },
    {
      done: passedTest || m.activeAgents > 0,
      title: "Test an agent",
      detail: "Every action is simulated, nothing changes in your systems.",
      href: buildingAgent ? `/agents/${buildingAgent.id}#test` : topOpportunity ? `/opportunities/${topOpportunity}` : "/opportunities",
      cta: buildingAgent ? "Run a test" : "Build and test",
    },
    {
      done: m.activeAgents > 0,
      title: "Go live at L2 or L3",
      detail: eligible
        ? `${eligible.name} passed every check. It drafts or proposes; a person approves.`
        : blocked?.firstBlocker
          ? `${blocked.name}: ${blocked.firstBlocker.label.toLowerCase()}. ${blocked.firstBlocker.detail}`
          : "Unlocks once an agent passes a test on real input and every check.",
      href: eligible ? `/agents/${eligible.id}` : blocked ? `/agents/${blocked.id}#readiness` : "/agents",
      cta: eligible ? "Activate it" : "View blockers",
    },
  ];
  const next = playbook.find((p) => !p.done);
  const playbookCard = next ? (
    <Card className="mb-4 lg:mb-6">
      <CardHeader>
        <CardTitle>Your first agent</CardTitle>
        <CardDescription>
          {playbook.filter((p) => p.done).length} of {playbook.length} done. Next: {next.title.toLowerCase()}.
        </CardDescription>
        <div aria-hidden className="mt-2 flex max-w-xs gap-1">
          {playbook.map((p) => (
            <span key={p.title} className={`h-1.5 flex-1 rounded-full ${p.done ? "bg-brand" : p === next ? "bg-highlight" : "bg-muted"}`} />
          ))}
        </div>
        <CardAction>
          <ButtonLink href={next.href} size="sm">
            {next.cta}
          </ButtonLink>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {playbook.map((p, i) => (
            <li key={p.title}>
              <Link
                href={p.href}
                className={`flex h-full items-start gap-3 rounded-xl border p-3.5 text-sm transition-colors hover:bg-accent ${p === next ? "border-primary/40 bg-brand-soft/60 ring-1 ring-primary/20" : p.done ? "bg-muted/40" : "bg-card"}`}
              >
                {p.done ? (
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <span
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold tabular-nums ${p === next ? "bg-primary text-primary-foreground" : "border"}`}
                  >
                    {i + 1}
                  </span>
                )}
                <span className="min-w-0">
                  <span className={`flex items-center gap-2 font-medium ${p.done ? "text-muted-foreground" : ""}`}>
                    {p.title}
                    {p === next ? <span className="eyebrow rounded bg-highlight-soft px-1.5 py-0.5 text-[11px] text-highlight-strong">Next</span> : null}
                  </span>
                  {!p.done ? <span className="mt-0.5 block text-xs text-muted-foreground">{p.detail}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ol>
        {!session.org.isDemo && playbook.filter((p) => p.done).length < 3 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Want to see it working first?</span>
            <JobButton size="sm" variant="outline" kind="sample_workspace" initialJob={sampleJob} pendingLabel="Setting up…">
              Explore a sample workspace
            </JobButton>
          </div>
        ) : null}
      </CardContent>
    </Card>
  ) : null;

  if (!m.processesMapped) {
    return (
      <>
        <PageHeader title="Home" description="How autonomous is your company?" />
        {playbookCard}
      </>
    );
  }

  // Two series: mapped work already on the company's own software, and what live agents add.
  // Days recorded before the split was stored count as all existing software (no live agents then).
  const perDay = new Map<string, { total: number; live: number }>();
  for (const t of trend ?? []) {
    const d = perDay.get(t.period) ?? { total: 0, live: 0 };
    if (t.metric === "autonomy_score") d.total = Number(t.value);
    else d.live = Number(t.value);
    perDay.set(t.period, d);
  }
  const point = (period: string, d: { total: number; live: number }) => ({ period, live: d.live, baseline: Math.max(0, d.total - d.live) });
  const byMonth = new Map<string, { total: number; live: number }>();
  for (const [day, d] of perDay) byMonth.set(day.slice(0, 7), d);
  const trendData = [...byMonth.entries()].map(([k, d]) => point(new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" }).format(new Date(`${k}-01T00:00:00Z`)), d));
  const daily = [...perDay.entries()].slice(-30).map(([day, d]) => point(day.slice(5), d));

  const chart = trendData.length > 1 ? trendData : daily;
  return (
    <>
      <PageHeader title="Home" />
      {playbookCard}
      <div className="mb-4 grid gap-4 lg:mb-6 lg:grid-cols-3">
        {/* Two meters, not one: what already runs on the company's own software, and what
            AutonomOS agents add (0% until one is live). */}
        <Card className={chart.length > 1 ? "" : "lg:col-span-3"}>
          <CardContent className={`grid gap-5 ${chart.length > 1 ? "" : "sm:grid-cols-2"}`}>
            <div data-testid="autonomy-live">
              <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                AutonomOS live
                <InfoTip label="What AutonomOS live means">
                  The share of your mapped work, weighted by time, that live AutonomOS agents now do without a person. It stays at 0% until you activate an agent. Tests never count.
                </InfoTip>
              </div>
              <div className="mt-1 font-display text-5xl font-semibold tracking-tight text-brand tabular-nums" data-testid="autonomy-score">
                {m.autonomyScore === null ? "–" : pct(Math.max(0, m.autonomyScore - (m.baselineAutonomy ?? 0)))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {m.autonomyScore === null
                  ? "Add time estimates to your processes to measure this."
                  : m.activeAgents === 0
                    ? "No agents are live yet. Activate one to move this."
                    : `${m.activeAgents} live agent${m.activeAgents === 1 ? "" : "s"} across ${m.processesAutomated} process${m.processesAutomated === 1 ? "" : "es"}.`}
              </p>
            </div>
            <div data-testid="autonomy-explainer">
              <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                Already automated in your stack
                <InfoTip label="What already automated means">
                  Work your existing software already does without a person, from the autonomy level recorded on each process. AutonomOS did not do this part.
                </InfoTip>
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{pct(m.baselineAutonomy)}</div>
              <p className="mt-1 text-xs text-muted-foreground">of mapped work, weighted by time. Together: {pct(m.autonomyScore)} runs without people.</p>
            </div>
          </CardContent>
        </Card>
        {chart.length > 1 ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Mapped work without people, over time</CardTitle>
              <CardDescription>Most of this rises when you map work your software already does. Only the AutonomOS line is agents.</CardDescription>
            </CardHeader>
            <CardContent>
              <AutonomyTrend data={chart} />
              <div className="mt-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">Why it moved</div>
                {(movers ?? []).length ? (
                  <ul className="mt-1 space-y-0.5">
                    {(movers ?? []).map((e) => (
                      <li key={e.id}>
                        <span className="tabular-nums">{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(e.occurred_at))}</span> · {e.title}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1">It changes when agents go live or change level, and when processes are added or re-estimated. Nothing like that has happened yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <StatStrip
        className="mb-4 lg:mb-6"
        items={[
          { label: "Active agents", value: num(m.activeAgents), hint: `${m.processesAutomated} of ${m.processesMapped} processes` },
          {
            label: "Hours saved",
            value: hours(m.minutesSaved),
            // Measured: counted from finished live runs. Each run is credited with its process's
            // estimated minutes, so the number is only as good as that estimate.
            hint: m.productionRuns
              ? `Measured over ${num(m.productionRuns)} live run${m.productionRuns === 1 ? "" : "s"}, at each process's estimated minutes; ${money(m.valueCreated, m.currency)} this month${m.roi !== null ? `, ${m.roi >= 100 ? Math.round(m.roi) : m.roi.toFixed(1)}× AI cost` : ""}`
              : "Measured from live runs only; none yet",
          },
          { label: "Tasks done", value: num(m.tasksExecuted), hint: m.productionRuns ? `${num(m.humanInterventions)} needed a human` : undefined },
          {
            label: "AI spend this month",
            value: (
              <span className="inline-flex items-center gap-1">
                {aiMoney(m.aiCost, m.currency)}
                <InfoTip label="What AI spend covers">
                  <p>
                    <strong>Setup</strong>: reading your website and systems, drafting processes, ideas and agents.
                  </p>
                  <p className="mt-1">
                    <strong>Tests</strong>: simulated runs, where nothing changes in your systems.
                  </p>
                  <p className="mt-1">
                    <strong>Live</strong>: work done by active agents. Only this is compared with the value created.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">Models are priced in US dollars and shown in your currency at a fixed reference rate.</p>
                </InfoTip>
              </span>
            ),
            // Every bucket is shown, so the parts add up to the total.
            hint: `setup ${aiMoney(m.aiCostBySource.setup, m.currency)} · tests ${aiMoney(m.aiCostBySource.test, m.currency)} · live ${aiMoney(m.aiCostBySource.production, m.currency)}`,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <Card>
          <CardHeader>
            <CardTitle>What to automate next</CardTitle>
            {(top ?? []).length ? (
              <CardAction>
                <ButtonLink href="/opportunities" variant="ghost" size="sm">
                  View all
                </ButtonLink>
              </CardAction>
            ) : null}
          </CardHeader>
          {(top ?? []).length ? (
            <div>
              {(top ?? []).map((o) => (
                <RowLink
                  key={o.id}
                  href={`/opportunities/${o.id}`}
                  title={o.title}
                  meta={
                    <>
                      <span>{(o.processes as unknown as { title: string } | null)?.title}</span>
                      <span>Estimated ~{num(Number(o.estimated_hours_saved_monthly ?? 0))} h / month</span>
                      <span>L{o.target_autonomy_level} target</span>
                    </>
                  }
                />
              ))}
            </div>
          ) : (
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {ideasEver ? (
                  <>
                    Every idea so far has an agent or a decision.{" "}
                    <Link href="/processes" className="font-medium text-primary underline-offset-4 hover:underline">
                      Find more ideas on a process
                    </Link>
                    .
                  </>
                ) : (
                  "Approve a process to see what to automate next."
                )}
              </p>
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Autonomy by department</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {m.departmentAutonomy
              .filter((d) => d.processes > 0)
              .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
              .map((d) => (
                <Link key={d.departmentId ?? "none"} href={d.departmentId ? `/processes?department=${d.departmentId}` : "/processes"} className="block">
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span className="truncate">{d.name}</span>
                    <span className="tabular-nums text-muted-foreground">{pct(d.score)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(2, (d.score ?? 0) * 100)}%` }} />
                  </div>
                </Link>
              ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
