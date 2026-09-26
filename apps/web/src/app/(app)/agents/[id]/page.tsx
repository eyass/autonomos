import { autonomyRecommendation } from "@autonomos/agents";
import { computeOrgMetrics } from "@autonomos/db";
import { getTool, SAMPLE_TICKETS } from "@autonomos/integrations";
import { INTEGRATION_EVENTS } from "@autonomos/schemas";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { AutonomyLadder, OutcomeBadge, StatusBadge } from "@/components/domain";
import { dateTime, hours, money, pct, relative, usd } from "@/lib/format";
import { adminDb, HttpError, isAdmin, requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { loadAgentConfig } from "@/server/agents";
import { activateAction, pauseAction } from "../actions";
import { AutonomyControl, LivePanel, TestPanel } from "./controls";
import { ButtonLink } from "@/components/app/button-link";
import { PageHeader } from "@/components/app/page-header";
import { RowLink } from "@/components/app/row-link";
import { StatCard } from "@/components/app/stat-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AgentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const session = await requireSession();
  let loaded;
  try {
    loaded = await loadAgentConfig(session, id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  const { agent, version, config } = loaded;
  const supabase = await createClient();
  const [{ data: process }, { data: runs }, { data: versions }, { data: zendesk }, metrics] = await Promise.all([
    supabase.from("processes").select("id, title").eq("organization_id", session.org.id).eq("id", agent.process_id).single(),
    supabase
      .from("agent_runs")
      .select("id, mode, status, outcome, summary, queued_at, model_cost, estimated_minutes_saved, agent_versions(version)")
      .eq("organization_id", session.org.id)
      .eq("agent_id", id)
      .order("queued_at", { ascending: false })
      .limit(15),
    supabase
      .from("agent_versions")
      .select("id, version, autonomy_level, change_note, created_at, users:created_by(first_name, last_name)")
      .eq("organization_id", session.org.id)
      .eq("agent_id", id)
      .order("version", { ascending: false }),
    supabase.from("integration_connections").select("provider").eq("organization_id", session.org.id).eq("integration_key", "zendesk").eq("status", "connected").maybeSingle(),
    computeOrgMetrics(adminDb(), session.org.id, new Date(0)),
  ]);
  const stats = metrics.perAgent.get(id);
  const recommendation = stats ? autonomyRecommendation(agent.autonomy_level, stats, agent.name) : null;
  const ticketDriven = config.tools.includes("zendesk.read_ticket");
  const samples = SAMPLE_TICKETS.map((s) => ({ key: s.key, label: s.label }));
  const refundThreshold = config.policy.amountThresholds.find((t) => t.tool === "stripe.create_refund")?.maxWithoutApproval ?? null;
  const triggerLabel =
    config.trigger.type === "manual"
      ? "Run manually"
      : config.trigger.type === "schedule"
        ? `On a schedule: ${config.trigger.cron} (${config.trigger.timezone})`
        : `When: ${INTEGRATION_EVENTS.find((e) => e.key === (config.trigger as { event: string }).event)?.label ?? (config.trigger as { event: string }).event}`;
  const hasCompletedTest = (runs ?? []).some((r) => r.mode === "test" && r.status === "completed");

  return (
    <>
      <PageHeader
        back={{ href: "/agents", label: "Agents" }}
        title={agent.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge status={agent.status} />
            <span>L{agent.autonomy_level}</span>
            <span>·</span>
            <Link className="hover:underline" href={`/processes/${process?.id}`}>
              {process?.title}
            </Link>
            <span>·</span>
            <span>v{version.version}</span>
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/agents/${id}/edit`} variant="outline">
              Edit
            </ButtonLink>
            {agent.status === "active" ? (
              <ActionButton variant="outline" action={pauseAction.bind(null, id)}>
                Pause
              </ActionButton>
            ) : isAdmin(session) ? (
              <ActionButton action={activateAction.bind(null, id)}>Activate agent</ActionButton>
            ) : null}
          </>
        }
      />

      {created ? (
        <Alert variant="success" className="mb-4">
          <AlertDescription>Agent created in draft. Run a test to see exactly what it would do, then activate it.</AlertDescription>
        </Alert>
      ) : agent.status !== "active" && !hasCompletedTest ? (
        <Alert variant="info" className="mb-4">
          <AlertDescription>This agent is not live. Run at least one test before activating it.</AlertDescription>
        </Alert>
      ) : null}
      {recommendation ? (
        <Alert variant={recommendation.direction === "increase" ? "success" : "warning"} className="mb-4">
          <AlertDescription>
            <div className="font-medium">{recommendation.message}</div>
            <div className="mt-1 text-xs">{recommendation.evidence.join(" · ")}</div>
            <a href="#autonomy" className="mt-2 inline-block text-xs font-medium underline">
              Review autonomy
            </a>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Runs" value={stats?.runs ?? 0} hint={stats?.testRuns ? `+ ${stats.testRuns} test` : undefined} />
        <StatCard label="Success rate" value={pct(stats?.successRate)} hint={`${pct(stats?.humanInterventionRate)} needed a human`} />
        <StatCard label="Hours saved" value={hours((stats?.hoursSaved ?? 0) * 60)} hint={`${money(stats?.estimatedValue ?? 0, session.org.currency)} value`} />
        <StatCard label="AI cost" value={usd(stats?.aiCost ?? 0)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-start-3 lg:row-start-1">
          <TestPanel agentId={id} ticketDriven={ticketDriven} samples={samples} />
          {agent.status === "active" ? <LivePanel agentId={id} samples={samples} ticketDriven={ticketDriven} sandbox={zendesk?.provider === "sandbox"} /> : null}
          <Card id="autonomy">
            <CardHeader>
              <CardTitle>Autonomy</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <AutonomyLadder current={agent.autonomy_level} />
              </div>
              <AutonomyControl agentId={id} level={agent.autonomy_level} hasMoney={config.tools.includes("stripe.create_refund")} threshold={refundThreshold} canChange={isAdmin(session)} />
            </CardContent>
          </Card>
        </div>
        <div className="min-w-0 space-y-6 lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardHeader>
              <CardTitle>Recent runs</CardTitle>
              <CardAction>
                <ButtonLink href={`/activity?agent=${id}`} variant="ghost" size="sm">
                  All activity
                </ButtonLink>
              </CardAction>
            </CardHeader>
            {(runs ?? []).length ? (
              <div>
                {(runs ?? []).map((r) => (
                  <RowLink
                    key={r.id}
                    href={`/activity/${r.id}`}
                    title={<span className="font-normal">{r.summary ?? "In progress"}</span>}
                    meta={
                      <>
                        {r.outcome ? <OutcomeBadge outcome={r.outcome} mode={r.mode} /> : <StatusBadge status={r.status} />}
                        <span>{relative(r.queued_at)}</span>
                        <span>v{(r.agent_versions as unknown as { version: number } | null)?.version}</span>
                        {Number(r.estimated_minutes_saved ?? 0) > 0 ? <span>{hours(Number(r.estimated_minutes_saved))} saved</span> : null}
                        <span>{usd(Number(r.model_cost))}</span>
                      </>
                    }
                  />
                ))}
              </div>
            ) : (
              <CardContent>
                <p className="text-sm text-muted-foreground">No runs yet.</p>
              </CardContent>
            )}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>How it works</CardTitle>
              <CardDescription>{`Configuration version ${version.version}`}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 text-sm md:grid-cols-2">
              <div className="md:col-span-2">
                <div className="mb-1 text-xs font-medium text-muted-foreground">Objective</div>
                <p>{config.instructions.objective}</p>
                <p className="mt-1 text-muted-foreground">{triggerLabel}</p>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">What the agent can do</div>
                <ul className="space-y-0.5">
                  {config.tools.map((t) => {
                    const def = getTool(t);
                    return (
                      <li key={t} className="flex flex-wrap items-center gap-x-2">
                        {def?.label ?? t} {def?.access === "write" ? <Badge variant="info">takes action</Badge> : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Needs your approval when</div>
                <ul className="list-inside list-disc">
                  {config.autonomyLevel <= 3 ? <li>Any action (L{config.autonomyLevel})</li> : null}
                  {(config.autonomyLevel >= 4 ? config.policy.approvalRequiredFor : []).map((t) => (
                    <li key={t}>{getTool(t)?.label ?? t}</li>
                  ))}
                  {(config.autonomyLevel >= 4 ? config.policy.amountThresholds : []).map((t) => (
                    <li key={t.tool}>
                      {getTool(t.tool)?.label ?? t.tool} above {money(t.maxWithoutApproval, session.org.currency)}
                    </li>
                  ))}
                  <li>Confidence below {Math.round(config.policy.confidenceThreshold * 100)}%</li>
                  {config.policy.conditions.map((c) => (
                    <li key={c.label}>{c.label}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Rules</div>
                <ul className="list-inside list-disc">
                  {config.instructions.rules.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Hands to a human when</div>
                <ul className="list-inside list-disc">
                  {config.instructions.escalationConditions.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                  {config.policy.hardLimits.map((h) => (
                    <li key={h.tool}>
                      {getTool(h.tool)?.label ?? h.tool} above {money(h.max, session.org.currency)} (never executed)
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
            <Collapsible className="border-t border-border px-4 py-3 text-sm sm:px-5">
              <CollapsibleTrigger className="group inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                Version history ({(versions ?? []).length})<ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-2 space-y-2">
                  {(versions ?? []).map((v) => {
                    const by = v.users as unknown as { first_name: string; last_name: string } | null;
                    return (
                      <li key={v.id} className="flex gap-3">
                        <span className="w-8 shrink-0 font-medium">v{v.version}</span>
                        <div className="min-w-0">
                          <div>{v.change_note ?? "No note"}</div>
                          <div className="text-xs text-muted-foreground">
                            L{v.autonomy_level} · {by ? `${by.first_name} ${by.last_name}` : "–"} · {dateTime(v.created_at)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        </div>
      </div>
    </>
  );
}
