import { StatusBadge } from "@/components/domain";
import { dateTime } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
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
  const { data } = await q;
  const tabs = (
    <LinkTabs
      items={[
        { href: "/approvals", label: "Needs your approval", active: !resolved },
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
      <PageHeader title="Approvals" description="Actions agents have prepared and are waiting for a person to decide." />
      {tabs}
      {views.length ? (
        <div className="space-y-4">
          {views.map((a) => (
            <ApprovalCard key={a.id} a={a} canApprove={session.canApprove} />
          ))}
        </div>
      ) : (
        <EmptyState title="Nothing needs your approval." description="When an agent prepares an action that needs a human, it appears here and you get notified." />
      )}
    </>
  );
}
