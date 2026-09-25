import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { AutonomyLadder, BeforeAfter, ScorePill, StatusBadge } from "@/components/domain";
import { Badge, ButtonLink, Card, CardBody, CardHeader, Notice, PageHeader, Stat } from "@/components/ui";
import { money, num } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { setOpportunityStatusAction } from "../actions";

type FutureStep = { title: string; actor: "agent" | "human" | "system"; approval?: boolean };

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const supabase = await createClient();
  const { data: o } = await supabase.from("automation_opportunities").select("*, processes(id, title, description, process_steps(position, title, performed_by))").eq("organization_id", session.org.id).eq("id", id).maybeSingle();
  if (!o) notFound();
  const [{ data: connections }, { data: agent }] = await Promise.all([
    supabase.from("integration_connections").select("integration_key, integrations(name)").eq("organization_id", session.org.id).eq("status", "connected"),
    supabase.from("agents").select("id, name, status").eq("organization_id", session.org.id).eq("opportunity_id", id).maybeSingle(),
  ]);
  const proc = o.processes as unknown as { id: string; title: string; description: string; process_steps: Array<{ position: number; title: string; performed_by: string | null }> };
  const today = [...(proc.process_steps ?? [])].sort((a, b) => a.position - b.position).map((s) => ({ title: s.title, performedBy: s.performed_by }));
  const connectedNames = (connections ?? []).map((c) => ((c.integrations as unknown as { name: string } | null)?.name ?? c.integration_key).toLowerCase());
  const agentSpec = o.proposed_agent as { name?: string; objective?: string; responsibilities?: string[] };
  const missing = o.required_integrations.filter((s) => !connectedNames.includes(s.toLowerCase()));

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/opportunities" className="text-muted hover:text-foreground">
          Opportunities
        </Link>
      </div>
      <PageHeader
        title={o.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/processes/${proc.id}`} className="hover:underline">
              {proc.title}
            </Link>
            <StatusBadge status={o.status} />
          </span>
        }
        actions={
          agent ? (
            <ButtonLink href={`/agents/${agent.id}`}>Open {agent.name}</ButtonLink>
          ) : (
            <>
              {o.status === "suggested" ? (
                <ActionButton variant="secondary" action={setOpportunityStatusAction.bind(null, id, "approved")}>
                  Approve
                </ActionButton>
              ) : null}
              {o.status !== "rejected" ? (
                <ActionButton variant="ghost" action={setOpportunityStatusAction.bind(null, id, "rejected")}>
                  Reject
                </ActionButton>
              ) : (
                <ActionButton variant="ghost" action={setOpportunityStatusAction.bind(null, id, "suggested")}>
                  Reopen
                </ActionButton>
              )}
              <ButtonLink href={`/agents/new?opportunity=${id}`}>Create agent</ButtonLink>
            </>
          )
        }
      />

      <p className="mb-6 max-w-3xl text-sm">{o.description}</p>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Estimated hours saved" value={`${num(Number(o.estimated_hours_saved_monthly ?? 0))} h`} hint="per month, estimate" />
        <Stat label="Estimated value" value={money(Number(o.estimated_cost_saved_monthly ?? 0), session.org.currency)} hint="per month, at your labour cost" />
        <Stat label="Business value" value={<ScorePill kind="value" value={o.business_value_score} />} />
        <Stat label="Difficulty" value={<ScorePill kind="difficulty" value={o.automation_difficulty_score} />} hint={o.estimated_build_complexity ?? undefined} />
        <Stat label="Risk" value={<ScorePill kind="risk" value={o.risk_score} />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="What is being automated" description={o.problem} />
            <CardBody>
              <BeforeAfter today={today} proposed={(o.future_state_steps as FutureStep[]) ?? []} />
              <p className="mt-4 text-sm text-muted">{o.proposed_future_state}</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="How the agent will operate" />
            <CardBody className="space-y-3 text-sm">
              <div className="font-medium">{agentSpec.name}</div>
              <p className="text-muted">{agentSpec.objective}</p>
              <ul className="list-inside list-disc">
                {(agentSpec.responsibilities ?? []).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Why it is valuable" />
            <CardBody className="text-sm text-muted">{o.rationale}</CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Autonomy" />
            <CardBody className="space-y-2 text-sm">
              <AutonomyLadder current={o.current_autonomy_level} target={o.target_autonomy_level} />
              <p className="text-muted">
                From L{o.current_autonomy_level} today to L{o.target_autonomy_level}.
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="What still needs humans" />
            <CardBody>
              <ul className="list-inside list-disc text-sm">
                {o.human_involvement.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Risk and controls" />
            <CardBody className="space-y-3 text-sm">
              <div>
                <div className="mb-1 text-xs font-medium text-muted">Approval rules</div>
                <ul className="list-inside list-disc">
                  {o.required_approvals.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted">Risks</div>
                <ul className="list-inside list-disc">
                  {o.major_risks.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-muted">Limits and escalations are enforced by the platform, not only by the agent&apos;s instructions.</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Required tools" />
            <CardBody className="flex flex-wrap gap-1.5">
              {o.required_integrations.map((s) => (
                <Badge key={s} tone={connectedNames.includes(s.toLowerCase()) ? "ok" : "warn"}>
                  {s} {connectedNames.includes(s.toLowerCase()) ? "connected" : "not connected"}
                </Badge>
              ))}
            </CardBody>
          </Card>
          {missing.length ? (
            <Notice tone="warn">
              Connect {missing.join(" and ")} in <Link className="underline" href="/integrations">Integrations</Link> before the agent can act.
            </Notice>
          ) : null}
        </div>
      </div>
    </>
  );
}
