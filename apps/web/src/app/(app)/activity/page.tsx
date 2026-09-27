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

export const metadata = { title: "Activity" };

const ATTENTION = ["warning", "error", "waiting"];
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

type Row = { id: string; occurred_at: string; actor_type: string; action_type: string; status: string; title: string; agent_run_id: string | null };
// Runs of the same kind of event in a row (twelve "Mapped a process") collapse into one line.
function grouped<T extends Row>(list: T[]): Array<{ first: T; rest: T[] }> {
  const out: Array<{ first: T; rest: T[] }> = [];
  for (const e of list) {
    const last = out.at(-1);
    if (last && !e.agent_run_id && !last.first.agent_run_id && last.first.action_type === e.action_type && last.first.status === e.status && last.first.actor_type === e.actor_type) last.rest.push(e);
    else out.push({ first: e, rest: [] });
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
  const { count: attention } = await supabase
    .from("activity_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", session.org.id)
    .in("status", ATTENTION)
    .gte("occurred_at", daysAgo(14));
  const view = f.view ?? (attention && !f.status ? "attention" : "all");
  if (view === "attention" && !f.status) q = q.in("status", ATTENTION);
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
      <PageHeader title="Activity" description="Everything agents and people did, across the company." />
      <LinkTabs
        items={[
          { href: `/activity?view=attention`, label: `Needs attention${attention ? ` (${attention})` : ""}`, active: view === "attention" },
          { href: `/activity?view=all`, label: "Everything", active: view === "all" },
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
          <EmptyState title="No activity yet." description="Agent runs, approvals and changes appear here as they happen." />
        )
      ) : (
        <div className="space-y-4">
          {[...byDay.entries()].map(([day, list]) => (
            <Card key={day}>
              <div className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground sm:px-5">{dateTime(`${day}T12:00:00Z`).split(",")[0]}</div>
              <ul>
                {grouped(list).map(({ first: e, rest }) => {
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
                    <div className="flex items-start gap-3 px-4 py-3 text-sm hover:bg-muted/50 sm:gap-4 sm:px-5">
                      <span className="w-11 shrink-0 tabular-nums text-muted-foreground">{time(e.occurred_at)}</span>
                      <div className="min-w-0 flex-1">
                        <div className={`flex items-center gap-1.5 text-xs font-medium ${e.actor_type === "agent" ? "text-highlight-strong" : "text-muted-foreground"}`}>
                          {e.actor_type === "agent" ? <span aria-hidden className="size-1.5 rounded-full bg-highlight" /> : null}
                          {who}
                        </div>
                        <div>{e.title}</div>
                        {rest.length ? (
                          <details className="mt-1 text-xs text-muted-foreground">
                            <summary className="cursor-pointer select-none hover:text-foreground">and {rest.length} more like it</summary>
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
                      {e.status !== "info" && e.status !== "success" ? (
                        <Badge variant={TONES[e.status] ?? "secondary"} className="shrink-0 capitalize">
                          {e.status}
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
