import { snapshotMetrics } from "@autonomos/db";
import Link from "next/link";
import { ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, RowLink, Stat } from "@/components/ui";
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

  const chart = trendData.length > 1 ? trendData : daily;
  return (
    <>
      <PageHeader title="Overview" description="How autonomous your company is, and what should become autonomous next." />
      <div className="mb-4 grid gap-4 lg:mb-6 lg:grid-cols-3">
        <Card>
          <CardBody>
            <div className="text-xs font-medium text-muted">Company autonomy score</div>
            <div className="mt-2 text-4xl font-semibold tabular-nums sm:text-5xl" data-testid="autonomy-score">
              {pct(m.autonomyScore)}
            </div>
            <p className="mt-2 text-xs text-muted">Share of mapped human work that agents handle, weighted by time.</p>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Autonomy over time" />
          <CardBody>{chart.length > 1 ? <AutonomyTrend data={chart} /> : <p className="py-8 text-center text-sm text-muted">The trend appears after the first days of use.</p>}</CardBody>
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:mb-6 lg:grid-cols-4">
        <Stat label="Active agents" value={num(m.activeAgents)} hint={`${m.processesAutomated} of ${m.processesMapped} processes`} />
        <Stat label="Hours saved" value={hours(m.minutesSaved)} hint="this month, estimate" />
        <Stat label="Tasks done" value={num(m.tasksExecuted)} hint={`${num(m.humanInterventions)} needed a human`} />
        <Stat label="Estimated ROI" value={m.roi === null ? "–" : `${m.roi >= 100 ? Math.round(m.roi) : m.roi.toFixed(1)}×`} hint={`${money(m.valueCreated, m.currency)} value, ${usd(m.aiCost)} AI`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <Card>
          <CardHeader title="What to automate next" action={<Link href="/opportunities" className="text-xs font-medium text-accent hover:underline">All {num(m.opportunities)}</Link>} />
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
            <CardBody>
              <p className="text-sm text-muted">Review a process and generate opportunities to see recommendations.</p>
            </CardBody>
          )}
        </Card>
        <Card>
          <CardHeader title="Autonomy by department" />
          <CardBody className="space-y-3">
            {m.departmentAutonomy
              .filter((d) => d.processes > 0)
              .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
              .map((d) => (
                <Link key={d.departmentId ?? "none"} href={d.departmentId ? `/processes?department=${d.departmentId}` : "/processes"} className="block">
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span className="truncate">{d.name}</span>
                    <span className="tabular-nums text-muted">{pct(d.score)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-muted">
                    <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(2, (d.score ?? 0) * 100)}%` }} />
                  </div>
                </Link>
              ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
