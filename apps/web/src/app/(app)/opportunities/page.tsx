import Link from "next/link";
import { LevelChange, Scores, StatusBadge } from "@/components/domain";
import { ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Tabs, Td, Th } from "@/components/ui";
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

  const rejected = q.status === "rejected";
  return (
    <>
      <PageHeader title="Opportunities" description="Where agents should take over work, best first. Risk is shown separately and never hidden in the ranking." />
      <Tabs
        items={[
          { href: "/opportunities", label: "Open", active: !rejected },
          { href: "/opportunities?status=rejected", label: "Rejected", active: rejected },
        ]}
      />
      {!list.length ? (
        <EmptyState title={rejected ? "No rejected opportunities." : "No open opportunities."} />
      ) : (
        <>
          <Card className="mb-6">
            <Table>
              <thead>
                <tr>
                  <Th>Opportunity</Th>
                  <Th className="hidden sm:table-cell">Hours saved</Th>
                  <Th className="hidden lg:table-cell">Scores</Th>
                  <Th className="hidden md:table-cell">Autonomy</Th>
                  <Th className="hidden md:table-cell">Status</Th>
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
                        <div className="mt-0.5 meta-dots flex flex-wrap gap-x-2 text-xs text-muted">
                          {proc ? <span>{proc.title}</span> : null}
                          <span className="sm:hidden">{num(Number(o.estimated_hours_saved_monthly ?? 0))} h / month</span>
                          <span className="md:hidden">
                            <LevelChange from={o.current_autonomy_level} to={o.target_autonomy_level} />
                          </span>
                        </div>
                      </Td>
                      <Td className="hidden tabular-nums sm:table-cell">
                        {num(Number(o.estimated_hours_saved_monthly ?? 0))} h / month
                        <div className="text-xs text-muted">{money(Number(o.estimated_cost_saved_monthly ?? 0), session.org.currency)}</div>
                      </Td>
                      <Td className="hidden lg:table-cell">
                        <Scores value={o.business_value_score} difficulty={o.automation_difficulty_score} risk={o.risk_score} />
                      </Td>
                      <Td className="hidden md:table-cell">
                        <LevelChange from={o.current_autonomy_level} to={o.target_autonomy_level} />
                      </Td>
                      <Td className="hidden md:table-cell">
                        <StatusBadge status={o.status} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Value vs difficulty" description="Bubble size is hours saved per month. Start top left." />
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
        </>
      )}
    </>
  );
}
