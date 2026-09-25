import { snapshotMetrics } from "@autonomos/db";
import Link from "next/link";
import { ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { hours, money, num, pct, usd } from "@/lib/format";
import { adminDb, requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { AutonomyTrend } from "./trend";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const session = await requireSession();
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

  if (!m.processesMapped) {
    return (
      <>
        <PageHeader title="Overview" description="How autonomous is your company?" />
        <EmptyState
          title="Your company isn't mapped yet."
          description="Describe how your teams work and AutonomOS builds an inventory of processes, finds what to automate, and measures the result."
          action={<ButtonLink href="/discover">Discover your first processes</ButtonLink>}
        />
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

  return (
    <>
      <PageHeader title="Overview" description="How autonomous is your company, and what should become autonomous next." />
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardBody>
            <div className="text-xs font-medium text-muted">Company autonomy score</div>
            <div className="mt-2 text-5xl font-semibold tabular-nums" data-testid="autonomy-score">
              {pct(m.autonomyScore)}
            </div>
            <p className="mt-2 text-xs text-muted">
              Share of mapped human work handled by agents, weighted by monthly time (L1 0, L2 20%, L3 40%, L4 75%, L5 100%).
            </p>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Autonomy over time" />
          <CardBody>{(trendData.length > 1 ? trendData : daily).length > 1 ? <AutonomyTrend data={trendData.length > 1 ? trendData : daily} /> : <p className="py-10 text-center text-sm text-muted">The trend appears after the first days of use.</p>}</CardBody>
        </Card>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Processes mapped" value={num(m.processesMapped)} />
        <Stat label="Automation opportunities" value={num(m.opportunities)} />
        <Stat label="Active agents" value={num(m.activeAgents)} hint={`${m.processesAutomated} process${m.processesAutomated === 1 ? "" : "es"} automated`} />
        <Stat label="Tasks executed this month" value={num(m.tasksExecuted)} />
        <Stat label="Human interventions" value={num(m.humanInterventions)} hint="this month" />
        <Stat label="Hours saved" value={hours(m.minutesSaved)} hint="this month, estimate" />
        <Stat label="Estimated value" value={money(m.valueCreated, m.currency)} hint={`at ${money(m.hourlyCost, m.currency)}/h`} />
        <Stat label="AI cost" value={usd(m.aiCost)} hint="this month" />
        <Stat label="Estimated ROI" value={m.roi === null ? "–" : `${m.roi >= 100 ? Math.round(m.roi) : m.roi.toFixed(1)}×`} hint="value ÷ AI cost" />
        <Stat label="Cost per completed task" value={m.tasksExecuted ? usd(m.aiCost / m.tasksExecuted) : "–"} hint="AI cost ÷ tasks" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Autonomy by department" />
          <CardBody className="space-y-3">
            {m.departmentAutonomy
              .filter((d) => d.processes > 0)
              .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
              .map((d) => (
                <Link key={d.departmentId ?? "none"} href={d.departmentId ? `/processes?department=${d.departmentId}` : "/processes"} className="block">
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{d.name}</span>
                    <span className="tabular-nums text-muted">{pct(d.score)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-muted">
                    <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(2, (d.score ?? 0) * 100)}%` }} />
                  </div>
                </Link>
              ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Highest-impact opportunities" description="What should become autonomous next" />
          <CardBody className="space-y-3">
            {(top ?? []).map((o) => (
              <div key={o.id} className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                <div>
                  <div className="text-sm font-medium">{o.title}</div>
                  <div className="text-xs text-muted">
                    {(o.processes as unknown as { title: string } | null)?.title} · ~{num(Number(o.estimated_hours_saved_monthly ?? 0))} h/month · difficulty {o.automation_difficulty_score}/5 · target L{o.target_autonomy_level}
                  </div>
                </div>
                <ButtonLink href={`/opportunities/${o.id}`} size="sm" variant="secondary">
                  Review opportunity
                </ButtonLink>
              </div>
            ))}
            {!top?.length ? <p className="text-sm text-muted">Review a process and generate opportunities to see recommendations.</p> : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
