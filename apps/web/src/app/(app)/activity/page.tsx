import { Activity, Bot, Cog } from "lucide-react";
import Link from "next/link";
import { reconcileStuckRuns } from "@/server/run-health";
import { FilterBar } from "@/components/filter-bar";
import { dateTime, time } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/app/empty-state";
import { LinkTabs } from "@/components/app/link-tabs";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export const metadata = { title: "History" };

const ATTENTION = ["warning", "error", "waiting"];
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

type Row = { id: string; occurred_at: string; actor_type: string; action_type: string; status: string; title: string; agent_run_id: string | null };
// One row per run (all its steps under "and N more"), and repeated similar events folded together.
// The run's row shows its most serious status, so a failure inside a run is never hidden.
const SEVERITY: Record<string, number> = { error: 4, warning: 3, waiting: 2, success: 1, info: 0 };
function grouped<T extends Row>(list: T[]): Array<{ first: T; rest: T[]; status: string }> {
  const out: Array<{ first: T; rest: T[]; status: string }> = [];
  const byRun = new Map<string, number>();
  for (const e of list) {
    if (e.agent_run_id && byRun.has(e.agent_run_id)) {
      const g = out[byRun.get(e.agent_run_id)!]!;
      g.rest.push(e);
      if ((SEVERITY[e.status] ?? 0) > (SEVERITY[g.status] ?? 0)) g.status = e.status;
      continue;
    }
    const last = out.at(-1);
    if (last && !e.agent_run_id && !last.first.agent_run_id && last.first.action_type === e.action_type && last.first.status === e.status && last.first.actor_type === e.actor_type) last.rest.push(e);
    else {
      out.push({ first: e, rest: [], status: e.status });
      if (e.agent_run_id) byRun.set(e.agent_run_id, out.length - 1);
    }
  }
  return out;
}

const TONES: Record<string, "success" | "warning" | "danger" | "secondary"> = { success: "success", warning: "warning", error: "danger", waiting: "warning", info: "secondary" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireSession();
  await reconcileStuckRuns(session.org.id);
  const f = await searchParams;
  const supabase = await createClient();
  let q = supabase
    .from("activity_events")
    .select("id, occurred_at, actor_type, action_type, status, title, detail, agent_id, agent_run_id, process_id, department_id, agents(name), users:actor_user_id(first_name, last_name)")
    .eq("organization_id", session.org.id)
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (f.department) q = q.eq("department_id", f.department);
  if (f.agent) q = q.eq("agent_id", f.agent);
  if (f.status) q = q.eq("status", f.status);
  if (f.type === "test") q = q.eq("detail->>mode", "test");
  else if (f.type) q = q.ilike("action_type", `%${f.type}%`);
  if (f.date) q = q.gte("occurred_at", `${f.date}T00:00:00Z`).lte("occurred_at", `${f.date}T23:59:59Z`);
  // "Needs attention" is the default whenever something does; "Everything" shows the rest.
  // Tests are expected to hand off and fail sometimes; they have their own tab so that
  // "Needs attention" only holds what happened for real.
  const NOT_TEST = "detail->>mode.is.null,detail->>mode.neq.test";
  const { count: attention } = await supabase
    .from("activity_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", session.org.id)
    .in("status", ATTENTION)
    .or(NOT_TEST)
    .gte("occurred_at", daysAgo(14));
  const view = f.view ?? (attention && !f.status && !f.type ? "attention" : "all");
  if (view === "attention" && !f.status) q = q.in("status", ATTENTION).or(NOT_TEST);
  if (view === "tests") q = q.eq("detail->>mode", "test");
  const [{ data: events }, { data: agents }, { data: departments }] = await Promise.all([
    q,
    supabase.from("agents").select("id, name").eq("organization_id", session.org.id),
    supabase.from("departments").select("id, name").eq("organization_id", session.org.id).is("archived_at", null),
  ]);

  const byDay = new Map<string, NonNullable<typeof events>>();
  for (const e of events ?? []) {
    const day = e.occurred_at.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }

  return (
    <>
      <PageHeader title="History" description="Everything agents and people did, across the company." />
      <LinkTabs
        items={[
          { href: `/activity?view=attention`, label: `Needs attention${attention ? ` (${attention})` : ""}`, active: view === "attention" },
          { href: `/activity?view=all`, label: "Everything", active: view === "all" },
          { href: `/activity?view=tests`, label: "Tests", active: view === "tests" },
        ]}
      />
      <FilterBar
        className="mb-4"
        activeCount={[f.department, f.agent, f.type, f.status, f.date].filter(Boolean).length}
        clearHref="/activity"
        more={
          <>
            <NativeSelect name="agent" defaultValue={f.agent ?? ""} aria-label="Agent">
              <NativeSelectOption value="">All agents</NativeSelectOption>
              {(agents ?? []).map((a) => (
                <NativeSelectOption key={a.id} value={a.id}>
                  {a.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect name="type" defaultValue={f.type ?? ""} aria-label="Action">
              <NativeSelectOption value="">All actions</NativeSelectOption>
              <NativeSelectOption value="refund">Refunds</NativeSelectOption>
              <NativeSelectOption value="send_reply">Replies</NativeSelectOption>
              <NativeSelectOption value="approval">Approvals</NativeSelectOption>
              <NativeSelectOption value="escalation">Escalations</NativeSelectOption>
              <NativeSelectOption value="run">Runs</NativeSelectOption>
              <NativeSelectOption value="test">Test runs</NativeSelectOption>
            </NativeSelect>
            <NativeSelect name="status" defaultValue={f.status ?? ""} aria-label="Status">
              <NativeSelectOption value="">Any status</NativeSelectOption>
              <NativeSelectOption value="success">Success</NativeSelectOption>
              <NativeSelectOption value="waiting">Waiting</NativeSelectOption>
              <NativeSelectOption value="warning">Warning</NativeSelectOption>
              <NativeSelectOption value="error">Error</NativeSelectOption>
            </NativeSelect>
            <NativeSelect name="department" defaultValue={f.department ?? ""} aria-label="Department">
              <NativeSelectOption value="">All departments</NativeSelectOption>
              {(departments ?? []).map((d) => (
                <NativeSelectOption key={d.id} value={d.id}>
                  {d.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Input type="date" name="date" defaultValue={f.date} aria-label="Date" />
          </>
        }
      />
      {!events?.length ? (
        view === "attention" ? (
          <EmptyState title="Nothing needs attention." description="Warnings, errors and runs waiting on a person show here." />
        ) : (
          <EmptyState icon={Activity} tone="violet" title="No activity yet." description="Agent runs, approvals and changes appear here as they happen." />
        )
      ) : (
        <div className="space-y-4">
          {[...byDay.entries()].map(([day, list]) => (
            <Card key={day} className="gap-0 overflow-hidden py-0 sm:gap-0 sm:py-0">
              <div className="eyebrow border-b border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground sm:px-5">{dateTime(`${day}T12:00:00Z`).split(",")[0]}</div>
              <ul>
                {grouped(list).map(({ first: e, rest, status }) => {
                  const who =
                    e.actor_type === "agent"
                      ? (e.agents as unknown as { name: string } | null)?.name
                      : e.actor_type === "user"
                        ? (() => {
                            const u = e.users as unknown as { first_name: string; last_name: string } | null;
                            return u ? `${u.first_name} ${u.last_name}` : "User";
                          })()
                        : "System";
                  const inner = (
                    <div className="flex items-start gap-3 px-4 py-3.5 text-sm transition-colors hover:bg-muted/50 sm:gap-4 sm:px-5">
                      <span className="w-11 shrink-0 pt-1.5 text-xs tabular-nums text-muted-foreground">{time(e.occurred_at)}</span>
                      <ActorAvatar type={e.actor_type} name={who ?? ""} />
                      <div className="min-w-0 flex-1">
                        <div className={`text-xs font-medium ${e.actor_type === "agent" ? "text-highlight-strong" : "text-muted-foreground"}`}>{who}</div>
                        <div>{e.title}</div>
                        {rest.length ? (
                          <details className="mt-1 text-xs text-muted-foreground">
                            <summary className="cursor-pointer select-none hover:text-foreground">
                              {e.agent_run_id ? `and ${rest.length} more step${rest.length === 1 ? "" : "s"} in this run` : `and ${rest.length} more like it`}
                            </summary>
                            <ul className="mt-1 space-y-0.5">
                              {rest.map((r) => (
                                <li key={r.id}>
                                  <span className="tabular-nums">{time(r.occurred_at)}</span> {r.title}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </div>
                      {(e.detail as { mode?: string } | null)?.mode === "test" ? (
                        <Badge variant="secondary" className="shrink-0">
                          Test
                        </Badge>
                      ) : null}
                      {status !== "info" && status !== "success" ? (
                        <Badge variant={TONES[status] ?? "secondary"} className="shrink-0 capitalize">
                          {status}
                        </Badge>
                      ) : null}
                    </div>
                  );
                  return (
                    <li key={e.id} className="border-b border-border last:border-0">
                      {e.agent_run_id ? <Link href={`/activity/${e.agent_run_id}`}>{inner}</Link> : inner}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// Who did it, at a glance: agents in the signal colour, people by initials, the system as a cog.
function ActorAvatar({ type, name }: { type: string; name: string }) {
  if (type === "agent") {
    return (
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-highlight-soft text-highlight-strong">
        <Bot className="size-4" />
      </span>
    );
  }
  if (type === "user") {
    const initials = name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    return (
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft font-mono text-[11px] font-semibold text-brand-strong">
        {initials || "?"}
      </span>
    );
  }
  return (
    <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <Cog className="size-4" />
    </span>
  );
}
