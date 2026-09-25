import Link from "next/link";
import { ScorePill, StatusBadge } from "@/components/domain";
import { ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { money, num } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { OpportunityMatrix } from "./matrix";

export const metadata = { title: "Opportunities" };

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ process?: string; status?: string }> }) {
  const session = await requireSession();
  const q = await searchParams;
  let query = (await createClient())
    .from("automation_opportunities")
    .select("id, title, status, business_value_score, automation_difficulty_score, risk_score, opportunity_score, estimated_hours_saved_monthly, estimated_cost_saved_monthly, current_autonomy_level, target_autonomy_level, processes(id, title), departments(name)")
    .eq("organization_id", session.org.id)
    .order("opportunity_score", { ascending: false });
  if (q.process) query = query.eq("process_id", q.process);
  if (q.status) query = query.eq("status", q.status as "suggested");
  else query = query.not("status", "in", "(rejected,archived)");
  const { data } = await query;
  const list = data ?? [];

  if (!list.length && !q.process && !q.status) {
    return (
      <>
        <PageHeader title="Opportunities" description="Where agents should take over work, ranked by value, difficulty and risk." />
        <EmptyState
          title="No opportunities yet."
          description="Review a process, then ask AutonomOS to find automation opportunities in it."
          action={<ButtonLink href="/processes">Go to processes</ButtonLink>}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Ranked by business value × automation potential ÷ difficulty. Risk is shown separately and never hidden in the ranking."
        actions={
          <>
            <ButtonLink href="/opportunities" variant={q.status ? "secondary" : "primary"} size="sm">
              Open
            </ButtonLink>
            <ButtonLink href="/opportunities?status=rejected" variant={q.status === "rejected" ? "primary" : "secondary"} size="sm">
              Rejected
            </ButtonLink>
          </>
        }
      />
      <Card className="mb-6">
        <CardHeader title="Value vs difficulty" description="Bubble size is estimated hours saved per month. Top left is where to start." />
        <CardBody>
          <OpportunityMatrix
            points={list.map((o) => ({
              id: o.id,
              title: o.title,
              value: o.business_value_score,
              difficulty: o.automation_difficulty_score,
              risk: o.risk_score,
              hours: Number(o.estimated_hours_saved_monthly ?? 0),
            }))}
          />
        </CardBody>
      </Card>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Opportunity</Th>
              <Th>Department</Th>
              <Th>Process</Th>
              <Th>Value</Th>
              <Th>Difficulty</Th>
              <Th>Risk</Th>
              <Th>Hours saved</Th>
              <Th>Current</Th>
              <Th>Target</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => {
              const proc = o.processes as unknown as { id: string; title: string } | null;
              return (
                <tr key={o.id} className="hover:bg-surface-muted/50">
                  <Td>
                    <Link href={`/opportunities/${o.id}`} className="font-medium hover:underline">
                      {o.title}
                    </Link>
                    <div className="text-xs text-muted">Score {Number(o.opportunity_score).toFixed(1)}</div>
                  </Td>
                  <Td className="text-muted">{(o.departments as unknown as { name: string } | null)?.name ?? "–"}</Td>
                  <Td>{proc ? <Link href={`/processes/${proc.id}`} className="text-muted hover:underline">{proc.title}</Link> : "–"}</Td>
                  <Td><ScorePill kind="value" value={o.business_value_score} /></Td>
                  <Td><ScorePill kind="difficulty" value={o.automation_difficulty_score} /></Td>
                  <Td><ScorePill kind="risk" value={o.risk_score} /></Td>
                  <Td className="tabular-nums">
                    {num(Number(o.estimated_hours_saved_monthly ?? 0))} h
                    <div className="text-xs text-muted">{money(Number(o.estimated_cost_saved_monthly ?? 0), session.org.currency)}</div>
                  </Td>
                  <Td>L{o.current_autonomy_level}</Td>
                  <Td className="font-medium">L{o.target_autonomy_level}</Td>
                  <Td><StatusBadge status={o.status} /></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
