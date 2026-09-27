import { computeOrgMetrics } from "@autonomos/db";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { AutonomyLadder, StatusBadge } from "@/components/domain";
import { hours, pct, aiMoney } from "@/lib/format";
import { adminDb, requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { activateAction, pauseAction } from "./actions";
import { loadAgentConfig } from "@/server/agents";
import { agentState } from "@/server/readiness";
import { ButtonLink } from "@/components/app/button-link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Agents" };

export default async function AgentsPage() {
  const session = await requireSession();
  const { data: agents } = await (await createClient())
    .from("agents")
    .select("id, name, status, autonomy_level, processes(id, title, departments(name))")
    .eq("organization_id", session.org.id)
    .neq("status", "archived")
    .order("created_at");
  if (!agents?.length) {
    return (
      <>
        <PageHeader title="Agents" description="Agents that run your processes, with what they can do and how they perform." />
        <EmptyState title="You haven't deployed any agents." description="Agents are built from automation ideas." action={<ButtonLink href="/opportunities">See automation ideas</ButtonLink>} />
      </>
    );
  }
  const metrics = await computeOrgMetrics(adminDb(), session.org.id, new Date(0));
  // The same checks as the agent page and activation: the list offers Activate only when they pass.
  const states = new Map(
    await Promise.all(
      agents
        .filter((a) => a.status !== "active")
        .map(async (a) => {
          const { version, config } = await loadAgentConfig(session, a.id);
          return [a.id, await agentState(session, { id: a.id, status: a.status, versionId: version.id }, config)] as const;
        }),
    ),
  );
  return (
    <>
      <PageHeader title="Agents" description="Only active agents act on their own." />
      <Card className="@container gap-0 overflow-hidden py-0 sm:py-0">
        <Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4 sm:[&_td:first-child]:pl-6 sm:[&_th:first-child]:pl-6">
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead className="hidden @2xl:table-cell">Autonomy</TableHead>
              <TableHead className="hidden @lg:table-cell">Live runs</TableHead>
              <TableHead className="hidden @2xl:table-cell">Success</TableHead>
              <TableHead className="hidden @4xl:table-cell">Hours saved</TableHead>
              <TableHead className="hidden @4xl:table-cell">AI cost</TableHead>
              <TableHead className="text-right @lg:text-left">Status</TableHead>
              <TableHead className="hidden @2xl:table-cell" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((a) => {
              const s = metrics.perAgent.get(a.id);
              const proc = a.processes as unknown as { id: string; title: string; departments: { name: string } | null } | null;
              return (
                // The name link covers the row; the Pause/Activate button sits above it.
                <TableRow key={a.id} className="relative hover:bg-muted/50 focus-within:bg-muted/50">
                  <TableCell className="w-full max-w-0 whitespace-normal">
                    <Link
                      href={`/agents/${a.id}`}
                      title={a.name}
                      className="line-clamp-2 font-medium break-words outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:underline focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                    >
                      {a.name}
                    </Link>
                    <div className="mt-0.5 meta-dots flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      <span>{proc?.title}</span>
                      <span className="@2xl:hidden">L{a.autonomy_level}</span>
                      <span className="@lg:hidden">
                        {s?.runs ?? 0} run{s?.runs === 1 ? "" : "s"}
                      </span>
                    </div>
                    {/* On a narrow screen the numbers the columns show come along under the name. */}
                    <dl className="mt-1 grid grid-cols-3 gap-2 text-xs @4xl:hidden">
                      <div className="@2xl:hidden">
                        <dt className="text-muted-foreground">Success</dt>
                        <dd className="tabular-nums">{pct(s?.successRate)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Hours saved</dt>
                        <dd className="tabular-nums">{hours((s?.hoursSaved ?? 0) * 60)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">AI cost</dt>
                        <dd className="tabular-nums">{aiMoney(s?.aiCost ?? 0, session.org.currency)}</dd>
                      </div>
                    </dl>
                  </TableCell>
                  <TableCell className="hidden @2xl:table-cell">
                    <AutonomyLadder current={a.autonomy_level} size="sm" />
                  </TableCell>
                  <TableCell className="hidden tabular-nums @lg:table-cell">
                    {s?.runs ?? 0}
                    {s?.testRuns ? <span className="text-xs text-muted-foreground"> +{s.testRuns} test</span> : null}
                  </TableCell>
                  <TableCell className="hidden @2xl:table-cell">{pct(s?.successRate)}</TableCell>
                  <TableCell className="hidden @4xl:table-cell">{hours((s?.hoursSaved ?? 0) * 60)}</TableCell>
                  <TableCell className="hidden @4xl:table-cell">{aiMoney(s?.aiCost ?? 0, session.org.currency)}</TableCell>
                  <TableCell className="text-right @lg:text-left">
                    <StatusBadge status={a.status} />
                  </TableCell>
                  <TableCell className="relative z-10 hidden whitespace-nowrap text-right @2xl:table-cell">
                    {a.status === "active" ? (
                      <ActionButton size="sm" variant="ghost" action={pauseAction.bind(null, a.id)}>
                        Pause
                      </ActionButton>
                    ) : states.get(a.id)?.canActivate ? (
                      <ActionButton
                        size="sm"
                        variant="ghost"
                        action={activateAction.bind(null, a.id)}
                        confirm={`Activate ${a.name}?`}
                        confirmLabel="Activate"
                        confirmDetail="It starts acting in the connected systems within its autonomy level. Open the agent to see exactly which systems are live and what it can change."
                      >
                        Activate
                      </ActionButton>
                    ) : (
                      <Link href={`/agents/${a.id}#test`} className="text-xs text-muted-foreground hover:text-foreground hover:underline" title={states.get(a.id)?.description}>
                        {states.get(a.id)?.title ?? "Not ready"}
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
