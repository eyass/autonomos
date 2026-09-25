import Link from "next/link";
import { StatusBadge } from "@/components/domain";
import { Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ApprovalCard, type ApprovalView } from "./card";

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
    <div className="mb-4 flex gap-4 border-b border-border text-sm">
      <Link href="/approvals" className={`-mb-px border-b-2 px-1 pb-2 ${!resolved ? "border-accent font-medium" : "border-transparent text-muted"}`}>
        Needs your approval
      </Link>
      <Link href="/approvals?view=resolved" className={`-mb-px border-b-2 px-1 pb-2 ${resolved ? "border-accent font-medium" : "border-transparent text-muted"}`}>
        Resolved
      </Link>
    </div>
  );

  if (resolved) {
    return (
      <>
        <PageHeader title="Approvals" description="Every decision is recorded in the audit log." />
        {tabs}
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Request</Th>
                <Th>Agent</Th>
                <Th>Decision</Th>
                <Th>By</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((a) => {
                const by = a.users as unknown as { first_name: string; last_name: string } | null;
                return (
                  <tr key={a.id}>
                    <Td>
                      <Link href={`/activity/${a.agent_run_id}`} className="hover:underline">
                        {a.title}
                      </Link>
                      {a.comment ? <div className="text-xs text-muted">“{a.comment}”</div> : null}
                    </Td>
                    <Td>{(a.agents as unknown as { name: string } | null)?.name}</Td>
                    <Td>
                      <StatusBadge status={a.status} />
                    </Td>
                    <Td className="text-muted">{by ? `${by.first_name} ${by.last_name}` : a.status === "expired" ? "Expired" : "–"}</Td>
                    <Td className="whitespace-nowrap text-muted">{dateTime(a.resolved_at)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
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
