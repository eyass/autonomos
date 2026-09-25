import Link from "next/link";
import { Badge, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { dateTime, time } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Activity" };

const TONES: Record<string, "ok" | "warn" | "danger" | "info" | "neutral"> = { success: "ok", warning: "warn", error: "danger", waiting: "warn", info: "neutral" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireSession();
  const f = await searchParams;
  const supabase = await createClient();
  let q = supabase
    .from("activity_events")
    .select("id, occurred_at, actor_type, action_type, status, title, agent_id, agent_run_id, process_id, department_id, agents(name), users:actor_user_id(first_name, last_name)")
    .eq("organization_id", session.org.id)
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (f.department) q = q.eq("department_id", f.department);
  if (f.agent) q = q.eq("agent_id", f.agent);
  if (f.status) q = q.eq("status", f.status);
  if (f.type) q = q.ilike("action_type", `%${f.type}%`);
  if (f.date) q = q.gte("occurred_at", `${f.date}T00:00:00Z`).lte("occurred_at", `${f.date}T23:59:59Z`);
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
      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <Select name="department" defaultValue={f.department ?? ""} className="w-40">
          <option value="">All departments</option>
          {(departments ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select name="agent" defaultValue={f.agent ?? ""} className="w-44">
          <option value="">All agents</option>
          {(agents ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select name="type" defaultValue={f.type ?? ""} className="w-40">
          <option value="">All actions</option>
          <option value="refund">Refunds</option>
          <option value="send_reply">Replies</option>
          <option value="approval">Approvals</option>
          <option value="escalation">Escalations</option>
          <option value="run">Runs</option>
        </Select>
        <Select name="status" defaultValue={f.status ?? ""} className="w-32">
          <option value="">Any status</option>
          <option value="success">Success</option>
          <option value="waiting">Waiting</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
        </Select>
        <Input type="date" name="date" defaultValue={f.date} className="w-40" />
        <button className="h-9 rounded-md border border-border px-3 text-sm hover:bg-surface-muted" type="submit">
          Filter
        </button>
      </form>
      {!events?.length ? (
        <EmptyState title="No activity yet." description="Agent runs, approvals and changes appear here as they happen." />
      ) : (
        <div className="space-y-6">
          {[...byDay.entries()].map(([day, list]) => (
            <Card key={day}>
              <div className="border-b border-border px-5 py-2 text-xs font-medium text-muted">{dateTime(`${day}T12:00:00Z`).split(",")[0]}</div>
              <ul>
                {list.map((e) => {
                  const who = e.actor_type === "agent" ? (e.agents as unknown as { name: string } | null)?.name : e.actor_type === "user" ? (() => { const u = e.users as unknown as { first_name: string; last_name: string } | null; return u ? `${u.first_name} ${u.last_name}` : "User"; })() : "System";
                  const inner = (
                    <div className="flex items-start gap-4 px-5 py-3 text-sm hover:bg-surface-muted/50">
                      <span className="w-12 shrink-0 tabular-nums text-muted">{time(e.occurred_at)}</span>
                      <div className="flex-1">
                        <div className="text-xs font-medium text-muted">{who}</div>
                        <div>{e.title}</div>
                      </div>
                      <Badge tone={TONES[e.status] ?? "neutral"}>{e.status}</Badge>
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
