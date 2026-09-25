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
              <Th>Process</Th>
              <Th>Department</Th>
              <Th>Autonomy</Th>
              <Th>Status</Th>
              <Th>Runs</Th>
              <Th>Success rate</Th>
              <Th>Human intervention</Th>
              <Th>Hours saved</Th>
              <Th>Cost</Th>
              <Th />
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
                  </Td>
                  <Td className="text-muted">{proc?.title}</Td>
                  <Td className="text-muted">{proc?.departments?.name ?? "–"}</Td>
                  <Td>
                    <AutonomyLadder current={a.autonomy_level} size="sm" />
                  </Td>
                  <Td>
                    <StatusBadge status={a.status} />
                  </Td>
                  <Td className="tabular-nums">
                    {s?.runs ?? 0}
                    {s?.testRuns ? <span className="text-xs text-muted"> +{s.testRuns} test</span> : null}
                  </Td>
                  <Td>{pct(s?.successRate)}</Td>
                  <Td>{pct(s?.humanInterventionRate)}</Td>
                  <Td>{hours((s?.hoursSaved ?? 0) * 60)}</Td>
                  <Td>{usd(s?.aiCost ?? 0)}</Td>
                  <Td className="whitespace-nowrap">
                    <span className="flex gap-1">
                      <Link href={`/agents/${a.id}#test`} className="rounded px-2 py-1 text-xs hover:bg-surface-muted">
                        Test
                      </Link>
                      {a.status === "active" ? (
                        <ActionButton size="sm" variant="ghost" action={pauseAction.bind(null, a.id)}>
                          Pause
                        </ActionButton>
                      ) : (
                        <ActionButton size="sm" variant="ghost" action={activateAction.bind(null, a.id)}>
                          Activate
                        </ActionButton>
                      )}
                    </span>
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
