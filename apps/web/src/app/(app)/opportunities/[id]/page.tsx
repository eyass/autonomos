import { ChevronDown, Sparkles } from "lucide-react";
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
import { StatStrip } from "@/components/app/stat-card";
import { LifecycleHelp } from "@/components/app/lifecycle-help";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
    supabase.from("agents").select("id, name, status, autonomy_level").eq("organization_id", session.org.id).eq("opportunity_id", id).maybeSingle(),
  ]);
  const proc = o.processes as unknown as { id: string; title: string; description: string; process_steps: Array<{ position: number; title: string; performed_by: string | null }> };
  const today = [...(proc.process_steps ?? [])].sort((a, b) => a.position - b.position).map((s) => ({ title: s.title, performedBy: s.performed_by }));
  const connectedNames = (connections ?? []).map((c) => ((c.integrations as unknown as { name: string } | null)?.name ?? c.integration_key).toLowerCase());
  const agentSpec = o.proposed_agent as { name?: string; objective?: string; responsibilities?: string[] };
  const evidence = (o.evidence as Array<{ source: string; detail: string }> | null) ?? [];
  const missing = o.required_integrations.filter((s) => !connectedNames.includes(s.toLowerCase()));

  const statusNote =
    o.status === "live"
      ? `Live at L${agent?.autonomy_level}. Putting this on hold or rejecting it pauses the agent.`
      : o.status === "reviewing"
        ? "On hold. The agent is paused."
        : o.status === "rejected"
          ? "Rejected."
          : o.status === "archived"
            ? "Done."
            : agent
              ? "The agent is being tested with simulated actions. This goes live when the agent is activated."
              : null;
  const controls = [
    { title: "Still done by people", items: o.human_involvement },
    { title: "Needs approval", items: o.required_approvals },
    { title: "Risks", items: o.major_risks },
  ].filter((g) => g.items.length);

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
            <LifecycleHelp kind="opportunity" />
          </span>
        }
        actions={
          agent ? (
            <>
              <ButtonLink href={`/agents/${agent.id}`}>Open agent</ButtonLink>
              {o.status === "rejected" || o.status === "archived" || o.status === "reviewing" ? (
                <ActionButton variant="outline" action={setOpportunityStatusAction.bind(null, id, "building")}>
                  Reopen
                </ActionButton>
              ) : (
                <>
                  <ActionButton
                    variant="outline"
                    action={setOpportunityStatusAction.bind(null, id, "archived")}
                    confirm="Mark this opportunity as done? It stays in the list as done; Reopen undoes it."
                    confirmLabel="Mark done"
                  >
                    Mark done
                  </ActionButton>
                  <ActionButton
                    variant="outline"
                    action={setOpportunityStatusAction.bind(null, id, "reviewing")}
                    confirm="Put this opportunity on hold? A live agent is paused until you reopen it."
                    confirmLabel="Put on hold"
                  >
                    Hold
                  </ActionButton>
                  <ActionButton
                    variant="outline"
                    action={setOpportunityStatusAction.bind(null, id, "rejected")}
                    confirm="Reject this opportunity? A live agent is paused. Reopen undoes it."
                    confirmLabel="Reject"
                  >
                    Reject
                  </ActionButton>
                </>
              )}
            </>
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
                <ActionButton variant="ghost" action={setOpportunityStatusAction.bind(null, id, "approved")}>
                  Approve
                </ActionButton>
              ) : null}
              {o.status !== "rejected" ? (
                <ActionButton variant="outline" action={setOpportunityStatusAction.bind(null, id, "rejected")} confirm="Reject this opportunity? Reopen undoes it." confirmLabel="Reject">
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
        <Alert variant="agent" className="mb-4">
          <Sparkles />
          <AlertDescription>Found when {proc.title} was approved. Building runs a simulated test, so nothing changes in your systems.</AlertDescription>
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

      <div className="mb-6 space-y-4">
        {statusNote ? <p className="text-sm font-medium">{statusNote}</p> : null}
        <p className="max-w-3xl text-sm text-muted-foreground">{o.description}</p>
        <StatStrip
          items={[
            { label: "Saves", value: `${num(Number(o.estimated_hours_saved_monthly ?? 0))} h/mo` },
            { label: "Worth", value: `${money(Number(o.estimated_cost_saved_monthly ?? 0), session.org.currency)}/mo` },
            { label: "Autonomy", value: <LevelChange from={o.current_autonomy_level} to={o.target_autonomy_level} /> },
            { label: "Scores", value: <Scores value={o.business_value_score} difficulty={o.automation_difficulty_score} risk={o.risk_score} className="mt-1 gap-x-2" /> },
          ]}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>What changes</CardTitle>
              {o.problem ? <CardDescription>{o.problem}</CardDescription> : null}
            </CardHeader>
            <CardContent>
              <BeforeAfter today={today} proposed={(o.future_state_steps as FutureStep[]) ?? []} />
            </CardContent>
          </Card>
          {evidence.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Why this opportunity</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm">
                  {evidence.map((e, i) => (
                    <li key={i}>
                      <div className="text-xs font-medium text-muted-foreground">{e.source}</div>
                      <div>{e.detail}</div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{agentSpec.name ?? "The agent"}</CardTitle>
              {agentSpec.objective ? <CardDescription>{agentSpec.objective}</CardDescription> : null}
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {agentSpec.responsibilities?.length ? (
                <ul className="list-inside list-disc space-y-0.5">
                  {agentSpec.responsibilities.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
              {controls.length || o.rationale ? (
                <Collapsible>
                  <CollapsibleTrigger className="group inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                    People, approvals and risks
                    <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 space-y-3">
                    {controls.map((g) => (
                      <div key={g.title}>
                        <div className="mb-1 text-xs text-muted-foreground">{g.title}</div>
                        <ul className="list-inside list-disc space-y-0.5">
                          {g.items.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {o.rationale ? (
                      <div>
                        <div className="mb-1 text-xs text-muted-foreground">Why it is worth it</div>
                        <p>{o.rationale}</p>
                      </div>
                    ) : null}
                    <p className="text-xs text-muted-foreground">Limits and escalations are enforced by the platform, not only by the agent&apos;s instructions.</p>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </CardContent>
            {o.required_integrations.length ? (
              <CardFooter className="flex-wrap gap-1.5 border-t">
                {o.required_integrations.map((s) => (
                  <Badge key={s} variant={connectedNames.includes(s.toLowerCase()) ? "success" : "warning"}>
                    {s}
                  </Badge>
                ))}
              </CardFooter>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
