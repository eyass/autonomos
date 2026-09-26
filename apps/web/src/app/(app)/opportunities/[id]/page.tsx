import { Sparkles } from "lucide-react";
import Link from "next/link";
import { buildAndTestAgentAction } from "@/app/(app)/agents/actions";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { BeforeAfter, LevelChange, Scores, StatusBadge } from "@/components/domain";
import { money, num } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { setOpportunityStatusAction } from "../actions";
import { ButtonLink } from "@/components/app/button-link";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type FutureStep = { title: string; actor: "agent" | "human" | "system"; approval?: boolean };

export default async function OpportunityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ found?: string }> }) {
  const { id } = await params;
  const { found } = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();
  const { data: o } = await supabase
    .from("automation_opportunities")
    .select("*, processes(id, title, description, process_steps(position, title, performed_by))")
    .eq("organization_id", session.org.id)
    .eq("id", id)
    .maybeSingle();
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
      <PageHeader
        back={{ href: "/opportunities", label: "Opportunities" }}
        title={o.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={o.status} />
            <Link href={`/processes/${proc.id}`} className="hover:underline">
              {proc.title}
            </Link>
          </span>
        }
        actions={
          agent ? (
            <ButtonLink href={`/agents/${agent.id}`}>Open {agent.name}</ButtonLink>
          ) : (
            <>
              <ActionButton action={buildAndTestAgentAction.bind(null, id)} pendingLabel="Building and testing…">
                <Sparkles />
                Build and test agent
              </ActionButton>
              <ButtonLink href={`/agents/new?opportunity=${id}`} variant="outline">
                Customise first
              </ButtonLink>
              {o.status === "suggested" ? (
                <ActionButton variant="outline" action={setOpportunityStatusAction.bind(null, id, "approved")}>
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
            </>
          )
        }
      />

      {found && !agent ? (
        <Alert variant="success" className="mb-4">
          <Sparkles />
          <AlertDescription>
            AutonomOS found this opportunity when {proc.title} was approved. Build and test the agent in one click: it runs a simulated test, so nothing changes in your systems.
          </AlertDescription>
        </Alert>
      ) : null}
      {missing.length ? (
        <Alert variant="warning" className="mb-4">
          <AlertDescription>
            Connect {missing.join(" and ")} in{" "}
            <Link className="underline" href="/integrations">
              Integrations
            </Link>{" "}
            before the agent can act.
          </AlertDescription>
        </Alert>
      ) : null}

      <p className="mb-6 max-w-3xl text-sm">{o.description}</p>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Hours saved" value={`${num(Number(o.estimated_hours_saved_monthly ?? 0))} h`} hint="per month, estimate" />
        <StatCard label="Estimated value" value={money(Number(o.estimated_cost_saved_monthly ?? 0), session.org.currency)} hint="per month" />
        <StatCard label="Autonomy" value={<LevelChange from={o.current_autonomy_level} to={o.target_autonomy_level} />} hint="today → target" />
        <Card className="px-4 py-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Scores</div>
          <Scores value={o.business_value_score} difficulty={o.automation_difficulty_score} risk={o.risk_score} className="flex-col items-start gap-1.5" />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>What changes</CardTitle>
              <CardDescription>{o.problem}</CardDescription>
            </CardHeader>
            <CardContent>
              <BeforeAfter today={today} proposed={(o.future_state_steps as FutureStep[]) ?? []} />
              <p className="mt-4 text-sm text-muted-foreground">{o.proposed_future_state}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>The proposed agent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="font-medium">{agentSpec.name}</div>
              <p className="text-muted-foreground">{agentSpec.objective}</p>
              <ul className="list-inside list-disc">
                {(agentSpec.responsibilities ?? []).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              {o.rationale ? (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Why it is worth it</div>
                  <p className="text-muted-foreground">{o.rationale}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Humans and controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Still done by people</div>
                <ul className="list-inside list-disc">
                  {o.human_involvement.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Needs approval</div>
                <ul className="list-inside list-disc">
                  {o.required_approvals.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Risks</div>
                <ul className="list-inside list-disc">
                  {o.major_risks.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">Limits and escalations are enforced by the platform, not only by the agent&apos;s instructions.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Systems needed</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {o.required_integrations.map((s) => (
                <Badge key={s} variant={connectedNames.includes(s.toLowerCase()) ? "success" : "warning"}>
                  {s} {connectedNames.includes(s.toLowerCase()) ? "connected" : "not connected"}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
