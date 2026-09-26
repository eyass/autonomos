import { snapshotMetrics } from "@autonomos/db";
import Link from "next/link";
import { hours, money, num, pct, usd } from "@/lib/format";
import { adminDb, requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { AutonomyTrend } from "./trend";
import { ButtonLink } from "@/components/app/button-link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { RowLink } from "@/components/app/row-link";
import { StatCard } from "@/components/app/stat-card";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
          <CardContent>
            <div className="text-xs font-medium text-muted-foreground">Company autonomy score</div>
            <div className="mt-2 text-4xl font-semibold tabular-nums sm:text-5xl" data-testid="autonomy-score">
              {pct(m.autonomyScore)}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Share of mapped human work that agents handle, weighted by time.</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Autonomy over time</CardTitle>
          </CardHeader>
          <CardContent>
            {chart.length > 1 ? <AutonomyTrend data={chart} /> : <p className="py-8 text-center text-sm text-muted-foreground">The trend appears after the first days of use.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:mb-6 lg:grid-cols-4">
        <StatCard label="Active agents" value={num(m.activeAgents)} hint={`${m.processesAutomated} of ${m.processesMapped} processes`} />
        <StatCard label="Hours saved" value={hours(m.minutesSaved)} hint="this month, estimate" />
        <StatCard label="Tasks done" value={num(m.tasksExecuted)} hint={`${num(m.humanInterventions)} needed a human`} />
        <StatCard
          label="Estimated ROI"
          value={m.roi === null ? "–" : `${m.roi >= 100 ? Math.round(m.roi) : m.roi.toFixed(1)}×`}
          hint={`${money(m.valueCreated, m.currency)} value, ${usd(m.aiCost)} AI`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <Card>
          <CardHeader>
            <CardTitle>What to automate next</CardTitle>
            <CardAction>
              <ButtonLink href="/opportunities" variant="ghost" size="sm">
                All {num(m.opportunities)}
              </ButtonLink>
            </CardAction>
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
              <p className="text-sm text-muted-foreground">Review a process and generate opportunities to see recommendations.</p>
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
