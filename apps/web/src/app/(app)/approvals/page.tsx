import { StatusBadge } from "@/components/domain";
import { dateTime } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { markHandledAction } from "./actions";
import { ApprovalCard, type ApprovalView } from "./card";
import { EmptyState } from "@/components/app/empty-state";
import { LinkTabs } from "@/components/app/link-tabs";
import { PageHeader } from "@/components/app/page-header";
import { RowLink } from "@/components/app/row-link";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const session = await requireSession();
  const { view } = await searchParams;
  const supabase = await createClient();
  const resolved = view === "resolved";
  let q = supabase
    .from("approval_requests")
    .select("*, agents(id, name), users:resolved_by(first_name, last_name)")
    .eq("organization_id", session.org.id)
    .order("requested_at", { ascending: false })
    .limit(100);
  q = resolved ? q.neq("status", "pending") : q.eq("status", "pending");
  const [{ data }, { data: handoffs }] = await Promise.all([
    q,
    // Work agents handed to a person, until someone marks it handled. Tests included, labelled.
    supabase
      .from("agent_runs")
      .select("id, mode, summary, finished_at, agents(name)")
      .eq("organization_id", session.org.id)
      .eq("outcome", "escalated")
      .is("handled_at", null)
      .order("finished_at", { ascending: false })
      .limit(30),
  ]);
  const tabs = (
    <LinkTabs
      items={[
        { href: "/approvals", label: `Needs a person${(data?.length ?? 0) + (handoffs?.length ?? 0) && !resolved ? ` (${(data?.length ?? 0) + (handoffs?.length ?? 0)})` : ""}`, active: !resolved },
        { href: "/approvals?view=resolved", label: "Resolved", active: resolved },
      ]}
    />
  );

  if (resolved) {
    return (
      <>
        <PageHeader title="Approvals" description="Every decision is recorded in the audit log." />
        {tabs}
        {data?.length ? (
          <Card>
            {data.map((a) => {
              const by = a.users as unknown as { first_name: string; last_name: string } | null;
              return (
                <RowLink
                  key={a.id}
                  href={`/activity/${a.agent_run_id}`}
                  title={a.title}
                  meta={
                    <>
                      <span>{(a.agents as unknown as { name: string } | null)?.name}</span>
                      <span>{by ? `${by.first_name} ${by.last_name}` : a.status === "expired" ? "Expired" : "–"}</span>
                      <span>{dateTime(a.resolved_at)}</span>
                      {a.comment ? <span className="w-full truncate">“{a.comment}”</span> : null}
                    </>
                  }
                  aside={<StatusBadge status={a.status} />}
                />
              );
            })}
          </Card>
        ) : (
          <EmptyState title="No resolved approvals yet." />
        )}
      </>
    );
  }

  const views: ApprovalView[] = (data ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    agentName: (a.agents as unknown as { name: string } | null)?.name ?? "Agent",
    agentId: a.agent_id,
    runId: a.agent_run_id,
    reason: a.reasoning_summary,
    description: a.description,
    confidence: a.confidence === null ? null : Number(a.confidence),
    risk: a.risk,
    proposed: a.proposed_action as Record<string, unknown>,
    modifiableFields: a.modifiable_fields,
    evidence: (a.evidence as ApprovalView["evidence"]) ?? [],
    checks: (a.policy_checks as ApprovalView["checks"]) ?? [],
    requestedAt: a.requested_at,
    expiresAt: a.expires_at,
  }));

  return (
    <>
      <PageHeader title="Approvals" description="Actions waiting for a person to decide." />
      {tabs}
      {views.length ? (
        <div className="space-y-4">
          {views.map((a) => (
            <ApprovalCard key={a.id} a={a} canApprove={session.canApprove} />
          ))}
        </div>
      ) : !handoffs?.length ? (
        <EmptyState
          title="Nothing needs a person right now."
          description="Actions an agent prepares for approval, and work it hands to a person, appear here and you get notified. Run a test from an agent to see one."
        />
      ) : null}
      {handoffs?.length ? (
        <section className={views.length ? "mt-6" : ""}>
          <h2 className="mb-2 text-sm font-semibold">Handed to a person</h2>
          <Card className="gap-0 py-0">
            {handoffs.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-0 sm:px-5">
                <Link href={`/activity/${r.id}`} className="min-w-0 flex-1 hover:underline">
                  <div className="text-sm font-medium">{r.summary ?? "Needs a person"}</div>
                  <div className="text-xs text-muted-foreground">
                    {(r.agents as unknown as { name: string } | null)?.name} · {dateTime(r.finished_at)}
                  </div>
                </Link>
                {r.mode === "test" ? <Badge variant="secondary">Test</Badge> : null}
                <ActionButton size="sm" variant="outline" action={markHandledAction.bind(null, r.id)}>
                  Mark handled
                </ActionButton>
              </div>
            ))}
          </Card>
        </section>
      ) : null}
    </>
  );
}
