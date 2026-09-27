import { snapshotMetrics } from "@autonomos/db";
import { reconcileStuckRuns } from "@/server/run-health";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { hours, money, num, pct, usd } from "@/lib/format";
import { adminDb, requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { AutonomyTrend } from "./trend";
import { ButtonLink } from "@/components/app/button-link";
import { PageHeader } from "@/components/app/page-header";
import { RowLink } from "@/components/app/row-link";
import { StatStrip } from "@/components/app/stat-card";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { createSampleWorkspaceAction } from "./shell-actions";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const session = await requireSession();
  await reconcileStuckRuns(session.org.id);
  const db = adminDb();
  // Recompute and store today's snapshot so the trend always includes today.
  const m = await snapshotMetrics(db, session.org.id);
  const supabase = await createClient();
  const [{ data: trend }, { data: top }] = await Promise.all([
    supabase.from("metrics").select("period, value").eq("organization_id", session.org.id).eq("metric", "autonomy_score").eq("dimension", "").order("period").limit(365),
    supabase
      .from("automation_opportunities")
      .select("id, title, estimated_hours_saved_monthly, automation_difficulty_score, target_autonomy_level, processes(title)")
      .eq("organization_id", session.org.id)
      .in("status", ["suggested", "reviewing", "approved"])
      .order("opportunity_score", { ascending: false })
      .limit(5),
  ]);

  // The path to a first live agent, shown until it is walked. Each step links to where it is done.
  const [{ count: connections }, { count: reviewed }, { count: tests }, { data: firstDraft }, { data: buildingAgent }] = await Promise.all([
    db.from("integration_connections").select("id", { count: "exact", head: true }).eq("organization_id", session.org.id).eq("status", "connected"),
    db.from("processes").select("id", { count: "exact", head: true }).eq("organization_id", session.org.id).in("status", ["reviewed", "active"]),
    db.from("agent_runs").select("id", { count: "exact", head: true }).eq("organization_id", session.org.id).eq("mode", "test").eq("status", "completed"),
    db.from("processes").select("id").eq("organization_id", session.org.id).eq("status", "draft").order("created_at").limit(1).maybeSingle(),
    db.from("agents").select("id").eq("organization_id", session.org.id).in("status", ["draft", "testing"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  // Each step opens the exact thing to act on, not just the list it is in.
  const topOpportunity = (top ?? [])[0]?.id;
  const playbook = [
    { done: (connections ?? 0) > 0, title: "Connect a system", detail: "Sandbox data is fine to start.", href: "/integrations", cta: "Connect" },
    { done: m.processesMapped > 0, title: "Map your processes", detail: "Review what AutonomOS drafted, or run a short interview.", href: "/discover", cta: "Discover" },
    {
      done: (reviewed ?? 0) > 0,
      title: "Approve one process",
      detail: "Approving finds its automation opportunities.",
      href: firstDraft ? `/processes/${firstDraft.id}` : "/processes?status=draft",
      cta: "Review a draft",
    },
    {
      done: m.opportunities > 0 || m.activeAgents > 0,
      title: "Pick an opportunity",
      detail: "Ranked by value, difficulty and risk.",
      href: topOpportunity ? `/opportunities/${topOpportunity}` : "/opportunities",
      cta: "Open the top one",
    },
    {
      done: (tests ?? 0) > 0,
      title: "Test an agent",
      detail: "Every action is simulated, nothing changes in your systems.",
      href: buildingAgent ? `/agents/${buildingAgent.id}#test` : topOpportunity ? `/opportunities/${topOpportunity}` : "/opportunities",
      cta: buildingAgent ? "Run a test" : "Build and test",
    },
    {
      done: m.activeAgents > 0,
      title: "Go live at L2 or L3",
      detail: "The agent drafts or proposes; a person approves.",
      href: buildingAgent ? `/agents/${buildingAgent.id}` : "/agents",
      cta: "Activate",
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
              <Link href={p.href} className={`flex items-start gap-3 rounded-lg border p-3 text-sm hover:bg-accent ${p === next ? "border-primary/50 bg-primary/5" : ""}`}>
                {p.done ? (
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] tabular-nums">{i + 1}</span>
                )}
                <span>
                  <span className={`block font-medium ${p.done ? "text-muted-foreground line-through" : ""}`}>{p.title}</span>
                  {!p.done ? <span className="block text-xs text-muted-foreground">{p.detail}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ol>
        {!session.org.isDemo && playbook.filter((p) => p.done).length < 3 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Want to see it working first?</span>
            <ActionButton size="sm" variant="outline" action={createSampleWorkspaceAction} pendingLabel="Setting up…">
              Explore a sample workspace
            </ActionButton>
          </div>
        ) : null}
      </CardContent>
    </Card>
  ) : null;

  if (!m.processesMapped) {
    return (
      <>
        <PageHeader title="Overview" description="How autonomous is your company?" />
        {playbookCard}
      </>
    );
  }

  const byMonth = new Map<string, number>();
  for (const t of trend ?? []) byMonth.set(t.period.slice(0, 7), Number(t.value));
  const trendData = [...byMonth.entries()].map(([k, v]) => ({
    period: new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" }).format(new Date(`${k}-01T00:00:00Z`)),
    value: v,
  }));
  const daily = (trend ?? []).slice(-30).map((t) => ({ period: t.period.slice(5), value: Number(t.value) }));

  const chart = trendData.length > 1 ? trendData : daily;
  return (
    <>
      <PageHeader title="Overview" />
      {playbookCard}
      <div className="mb-4 grid gap-4 lg:mb-6 lg:grid-cols-3">
        <Card className={chart.length > 1 ? "" : "lg:col-span-3"}>
          <CardContent className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-muted-foreground">Company autonomy</div>
              <div className="mt-1 font-display text-5xl font-semibold tracking-tight text-brand tabular-nums" data-testid="autonomy-score">
                {pct(m.autonomyScore)}
              </div>
            </div>
            <p className="max-w-48 text-right text-xs text-muted-foreground">of mapped human work, weighted by time, is done by agents</p>
          </CardContent>
        </Card>
        {chart.length > 1 ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Autonomy over time</CardTitle>
            </CardHeader>
            <CardContent>
              <AutonomyTrend data={chart} />
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
            hint: m.productionRuns
              ? `${money(m.valueCreated, m.currency)} this month${m.roi !== null ? `, ${m.roi >= 100 ? Math.round(m.roi) : m.roi.toFixed(1)}× AI cost` : ""}`
              : "From production runs",
          },
          { label: "Tasks done", value: num(m.tasksExecuted), hint: m.productionRuns ? `${num(m.humanInterventions)} needed a human` : undefined },
          { label: "AI spend", value: usd(m.aiCost), hint: "this month" },
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
                      <span>~{num(Number(o.estimated_hours_saved_monthly ?? 0))} h / month</span>
                      <span>L{o.target_autonomy_level} target</span>
                    </>
                  }
                />
              ))}
            </div>
          ) : (
            <CardContent>
              <p className="text-sm text-muted-foreground">Approve a process to see what to automate next.</p>
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
