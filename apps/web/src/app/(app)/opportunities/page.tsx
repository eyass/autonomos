import Link from "next/link";
import { LevelChange, Scores, StatusBadge } from "@/components/domain";
import { money, num } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { OpportunityMatrix } from "./matrix";
import { ButtonLink } from "@/components/app/button-link";
import { EmptyState } from "@/components/app/empty-state";
import { LinkTabs } from "@/components/app/link-tabs";
import { PageHeader } from "@/components/app/page-header";
import { WorkTabs } from "@/components/app/work-tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Automation ideas" };

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ process?: string; status?: string }> }) {
  const session = await requireSession();
  const q = await searchParams;
  let query = (await createClient())
    .from("automation_opportunities")
    .select(
      "id, title, status, business_value_score, automation_difficulty_score, risk_score, opportunity_score, estimated_hours_saved_monthly, estimated_cost_saved_monthly, current_autonomy_level, target_autonomy_level, processes(id, title), departments(name)",
    )
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
        <PageHeader title="Work" description="Your recurring work, and ideas to automate it." />
        <WorkTabs active="ideas" />
        <EmptyState
          title="No automation ideas yet."
          description="Approve a process and AutonomOS suggests where an agent could take over."
          action={<ButtonLink href="/processes">Go to processes</ButtonLink>}
        />
      </>
    );
  }

  const rejected = q.status === "rejected";
  const done = q.status === "archived";
  return (
    <>
      <PageHeader title="Work" description="Your recurring work, and ideas to automate it." />
      <WorkTabs active="ideas" />
      <LinkTabs
        items={[
          { href: "/opportunities", label: "Open ideas", active: !rejected && !done },
          { href: "/opportunities?status=archived", label: "Done", active: done },
          { href: "/opportunities?status=rejected", label: "Rejected", active: rejected },
        ]}
      />
      {!list.length ? (
        <EmptyState title={rejected ? "No rejected ideas." : done ? "No ideas marked done." : "No open ideas."} />
      ) : (
        <>
          <Card className="@container mb-6 gap-0 overflow-hidden py-0 sm:py-0">
            <Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4 sm:[&_td:first-child]:pl-6 sm:[&_th:first-child]:pl-6">
              <TableHeader>
                <TableRow>
                  <TableHead>Idea</TableHead>
                  <TableHead className="hidden @lg:table-cell">Hours saved</TableHead>
                  <TableHead className="hidden @4xl:table-cell">Scores</TableHead>
                  <TableHead className="hidden @2xl:table-cell">Autonomy</TableHead>
                  <TableHead className="hidden @2xl:table-cell">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((o) => {
                  const proc = o.processes as unknown as { id: string; title: string } | null;
                  return (
                    // The title link covers the whole row, so the row opens on a tap, click or Enter.
                    <TableRow key={o.id} className="relative hover:bg-muted/50 focus-within:bg-muted/50">
                      <TableCell className="w-full max-w-0 whitespace-normal">
                        <Link
                          href={`/opportunities/${o.id}`}
                          title={o.title}
                          className="line-clamp-2 font-medium break-words outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:underline focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                        >
                          {o.title}
                        </Link>
                        <div className="mt-0.5 meta-dots flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                          {proc ? <span>{proc.title}</span> : null}
                          <span className="@lg:hidden">{num(Number(o.estimated_hours_saved_monthly ?? 0))} h / month</span>
                          <span className="@2xl:hidden">
                            <LevelChange from={o.current_autonomy_level} to={o.target_autonomy_level} />
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden tabular-nums @lg:table-cell">
                        {num(Number(o.estimated_hours_saved_monthly ?? 0))} h / month
                        <div className="text-xs text-muted-foreground">{money(Number(o.estimated_cost_saved_monthly ?? 0), session.org.currency)}</div>
                      </TableCell>
                      <TableCell className="hidden @4xl:table-cell">
                        <Scores dense value={o.business_value_score} difficulty={o.automation_difficulty_score} risk={o.risk_score} />
                      </TableCell>
                      <TableCell className="hidden @2xl:table-cell">
                        <LevelChange from={o.current_autonomy_level} to={o.target_autonomy_level} />
                      </TableCell>
                      <TableCell className="hidden @2xl:table-cell">
                        <StatusBadge status={o.status} kind="opportunity" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Value vs difficulty</CardTitle>
              <CardDescription>Bubble size is hours saved per month. Start top left.</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
