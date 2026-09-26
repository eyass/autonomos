import { computeOrgMetrics } from "@autonomos/db";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { AutonomyLadder, StatusBadge } from "@/components/domain";
import { ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { hours, pct, usd } from "@/lib/format";
import { adminDb, requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { activateAction, pauseAction } from "./actions";

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
        <EmptyState title="You haven't deployed any agents." description="Agents are created from automation opportunities." action={<ButtonLink href="/opportunities">Review automation opportunities</ButtonLink>} />
      </>
    );
  }
  const metrics = await computeOrgMetrics(adminDb(), session.org.id, new Date(0));
  return (
    <>
      <PageHeader title="Agents" description="Agents that run your processes. Only active agents act on their own." />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Agent</Th>
              <Th className="hidden md:table-cell">Autonomy</Th>
              <Th className="hidden sm:table-cell">Runs</Th>
              <Th className="hidden md:table-cell">Success</Th>
              <Th className="hidden lg:table-cell">Hours saved</Th>
              <Th className="hidden lg:table-cell">AI cost</Th>
              <Th className="text-right sm:text-left">Status</Th>
              <Th className="hidden md:table-cell" />
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const s = metrics.perAgent.get(a.id);
              const proc = a.processes as unknown as { id: string; title: string; departments: { name: string } | null } | null;
              return (
                <tr key={a.id} className="hover:bg-surface-muted/50">
                  <Td>
                    <Link href={`/agents/${a.id}`} className="font-medium hover:underline">
                      {a.name}
                    </Link>
                    <div className="mt-0.5 meta-dots flex flex-wrap gap-x-2 text-xs text-muted">
                      <span>{proc?.title}</span>
                      <span className="md:hidden">L{a.autonomy_level}</span>
                      <span className="sm:hidden">
                        {s?.runs ?? 0} run{s?.runs === 1 ? "" : "s"}
                      </span>
                    </div>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <AutonomyLadder current={a.autonomy_level} size="sm" />
                  </Td>
                  <Td className="hidden tabular-nums sm:table-cell">
                    {s?.runs ?? 0}
                    {s?.testRuns ? <span className="text-xs text-muted"> +{s.testRuns} test</span> : null}
                  </Td>
                  <Td className="hidden md:table-cell">{pct(s?.successRate)}</Td>
                  <Td className="hidden lg:table-cell">{hours((s?.hoursSaved ?? 0) * 60)}</Td>
                  <Td className="hidden lg:table-cell">{usd(s?.aiCost ?? 0)}</Td>
                  <Td className="text-right sm:text-left">
                    <StatusBadge status={a.status} />
                  </Td>
                  <Td className="hidden whitespace-nowrap text-right md:table-cell">
                    {a.status === "active" ? (
                      <ActionButton size="sm" variant="ghost" action={pauseAction.bind(null, a.id)}>
                        Pause
                      </ActionButton>
                    ) : (
                      <ActionButton size="sm" variant="ghost" action={activateAction.bind(null, a.id)}>
                        Activate
                      </ActionButton>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
