import { LevelMeter } from "@/components/brand/logo";
import { autonomyRecommendation } from "@autonomos/agents";
import { reconcileStuckRuns } from "@/server/run-health";
import { computeOrgMetrics } from "@autonomos/db";
import { getTool, SAMPLE_TICKETS } from "@autonomos/integrations";
import { INTEGRATION_EVENTS } from "@autonomos/schemas";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { AutonomyLadder, OutcomeBadge, StatusBadge } from "@/components/domain";
import { dateTime, hours, money, pct, relative, aiMoney } from "@/lib/format";
import { adminDb, HttpError, isAdmin, requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { loadAgentConfig } from "@/server/agents";
import { agentState } from "@/server/readiness";
import { diffVersions, type VersionSnapshot } from "@/lib/version-diff";
import { ReadinessChecklist } from "@/components/app/readiness-checklist";
import { activateAction, pauseAction } from "../actions";
import { AutonomyControl, LivePanel, TestPanel } from "./controls";
import { ButtonLink } from "@/components/app/button-link";
import { PageHeader } from "@/components/app/page-header";
import { RowLink } from "@/components/app/row-link";
import { StatStrip } from "@/components/app/stat-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Test runs execute on this server after the response, so give them room to finish.
export const maxDuration = 300;

function snapshot(v: { autonomy_level: number; instructions: unknown; trigger_config: unknown; policy_config: unknown; agent_tools: unknown }): VersionSnapshot {
  return {
    autonomy_level: v.autonomy_level,
    instructions: v.instructions as VersionSnapshot["instructions"],
    trigger_config: v.trigger_config as VersionSnapshot["trigger_config"],
    policy_config: v.policy_config as VersionSnapshot["policy_config"],
    tools: ((v.agent_tools as Array<{ tool_key: string }> | null) ?? []).map((t) => t.tool_key).sort(),
  };
}

export default async function AgentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const session = await requireSession();
  await reconcileStuckRuns(session.org.id);
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
      .select("id, version, autonomy_level, change_note, created_at, instructions, trigger_config, policy_config, agent_tools(tool_key), users:created_by(first_name, last_name)")
      .eq("organization_id", session.org.id)
      .eq("agent_id", id)
      .order("version", { ascending: false }),
    supabase.from("integration_connections").select("provider").eq("organization_id", session.org.id).eq("integration_key", "zendesk").eq("status", "connected").maybeSingle(),
    computeOrgMetrics(adminDb(), session.org.id, new Date(0)),
  ]);
  const stats = metrics.perAgent.get(id);
  const state = await agentState(session, { id, status: agent.status, versionId: version.id }, config);
  // Before going live: which of its systems are real accounts, and what it can change there.
  const { data: conns } = await adminDb().from("integration_connections").select("integration_key, provider, integrations(name)").eq("organization_id", session.org.id).eq("status", "connected");
  const connOf = new Map((conns ?? []).map((c) => [c.integration_key, c]));
  const toolDefs = config.tools.map((t) => getTool(t)).filter((d): d is NonNullable<ReturnType<typeof getTool>> => Boolean(d) && d!.integration !== "knowledge");
  const systemName = (key: string) => (connOf.get(key)?.integrations as unknown as { name: string } | null)?.name ?? key;
  const liveSystems = [...new Set(toolDefs.filter((d) => connOf.get(d.integration)?.provider !== "sandbox" && connOf.has(d.integration)).map((d) => systemName(d.integration)))];
  const writeScopes = toolDefs
    .filter((d) => d.access === "write")
    .map((d) => ({
      key: d.key,
      label: d.label,
      system: systemName(d.integration),
      live: connOf.has(d.integration) && connOf.get(d.integration)?.provider !== "sandbox",
      approval: config.autonomyLevel <= 3 || config.policy.approvalRequiredFor.includes(d.key),
    }));
  const readiness = state.readiness;
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
  // What a test will run into, said before it runs rather than discovered from an escalation.
  const readTools = config.tools.map((t) => getTool(t)).filter((d) => d?.access === "read" && d.integration !== "knowledge");
  const integrationsCheck = readiness.checks.find((c) => c.key === "integrations");
  const testWarnings = [
    ...(!ticketDriven && !readTools.length ? ["It has no tools that read data, so it only has what the input contains. With an empty input it hands the run to a person."] : []),
    ...(integrationsCheck && !integrationsCheck.ok ? [integrationsCheck.detail] : []),
  ];
  const sampleInput =
    config.trigger.type === "schedule"
      ? { period: lastWeek(), note: "The run covers this period." }
      : config.trigger.type === "integration_event"
        ? { event: (config.trigger as { event: string }).event, data: { id: "sample-1", summary: "Describe the record the event is about" } }
        : { request: `A typical request for ${agent.name}`, details: "Add the facts the agent needs, e.g. ids, amounts, dates" };
  const hasCompletedTest = (runs ?? []).some((r) => r.mode === "test" && r.status === "completed");

  return (
    <>
      <PageHeader
        back={{ href: "/agents", label: "Agents" }}
        title={agent.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge status={agent.status} />
            <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold" title={`Autonomy L${agent.autonomy_level}`}>
              <LevelMeter level={agent.autonomy_level} className="h-3" />L{agent.autonomy_level}
            </span>
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
              <ActionButton
                action={activateAction.bind(null, id)}
                disabled={!state.canActivate}
                confirm={liveSystems.length ? `Go live in real systems: ${liveSystems.join(", ")}?` : "Go live on sandbox data?"}
                confirmLabel="Activate"
                confirmDetail={
                  <>
                    <p>
                      {liveSystems.length
                        ? "These are live accounts. From now on this agent acts on real customers and data within its autonomy level."
                        : "Only sandbox systems are connected, so nothing real changes."}{" "}
                      It runs at L{agent.autonomy_level}.
                    </p>
                    {writeScopes.length ? (
                      <div>
                        <div className="font-medium text-foreground">What it can change</div>
                        <ul className="list-inside list-disc">
                          {writeScopes.map((w) => (
                            <li key={w.key}>
                              {w.label}{" "}
                              <span className="text-muted-foreground">
                                ({w.system}, {w.live ? "live" : "sandbox"}
                                {w.approval ? ", needs approval" : ""})
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p>It cannot change anything; it only reads and reports.</p>
                    )}
                    <p className="text-xs">This is recorded in the audit log. Pause stops it at any time.</p>
                  </>
                }
              >
                Activate agent
              </ActionButton>
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

      <StatStrip
        className="mb-6"
        items={[
          { label: "Runs", value: stats?.runs ?? 0, hint: stats?.testRuns ? `+ ${stats.testRuns} test` : undefined },
          { label: "Success", value: pct(stats?.successRate), hint: `${pct(stats?.humanInterventionRate)} needed a human` },
          { label: "Saved", value: hours((stats?.hoursSaved ?? 0) * 60), hint: money(stats?.estimatedValue ?? 0, session.org.currency) },
          { label: "AI cost", value: aiMoney(stats?.aiCost ?? 0, session.org.currency) },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-start-3 lg:row-start-1">
          {state.phase !== "live" || !readiness.ready ? (
            <Card id="readiness" className="scroll-mt-20" data-testid="agent-state" data-phase={state.phase}>
              <CardHeader>
                <CardTitle>{state.title}</CardTitle>
                <CardDescription>{state.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ReadinessChecklist checks={readiness.checks} />
              </CardContent>
            </Card>
          ) : null}
          <TestPanel agentId={id} ticketDriven={ticketDriven} samples={samples} blockedReason={state.testBlockedReason} warnings={testWarnings} sampleInput={JSON.stringify(sampleInput, null, 2)} />
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
                        <span>{aiMoney(Number(r.model_cost), session.org.currency)}</span>
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
              <CardDescription>{`Version ${version.version}`}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 text-sm md:grid-cols-2">
              <div className="md:col-span-2">
                <div className="mb-1 text-xs font-medium text-muted-foreground">Objective</div>
                <p>{config.instructions.objective}</p>
                <p className="mt-1 text-muted-foreground">{triggerLabel}</p>
              </div>
              <div className="md:col-span-2">
                <div className="mb-1 text-xs font-medium text-muted-foreground">What the agent can do</div>
                <ul className="flex flex-wrap gap-1.5">
                  {config.tools.map((t) => {
                    const def = getTool(t);
                    return (
                      <li key={t}>
                        <Badge variant={def?.access === "write" ? "info" : "secondary"}>
                          {def?.label ?? t}
                          {def?.access === "write" ? " · acts" : ""}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <Collapsible className="md:col-span-2">
                <CollapsibleTrigger className="group inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  Approvals, rules and hand-offs
                  <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 grid gap-5 md:grid-cols-3">
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
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
            <Collapsible className="border-t border-border px-4 py-3 text-sm sm:px-5">
              <CollapsibleTrigger className="group inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                Version history ({(versions ?? []).length})<ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-2 space-y-2">
                  {(versions ?? []).map((v, i, all) => {
                    const by = v.users as unknown as { first_name: string; last_name: string } | null;
                    const prev = all[i + 1];
                    const changes = prev ? diffVersions(snapshot(prev), snapshot(v)) : [];
                    return (
                      <li key={v.id} className="flex gap-3">
                        <span className="w-8 shrink-0 font-medium">v{v.version}</span>
                        <div className="min-w-0">
                          <div>{v.change_note ?? "No note"}</div>
                          <div className="text-xs text-muted-foreground">
                            L{v.autonomy_level} · {by ? `${by.first_name} ${by.last_name}` : "–"} · {dateTime(v.created_at)}
                          </div>
                          {prev ? (
                            changes.length ? (
                              <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                                {changes.map((c) => (
                                  <li key={c}>{c}</li>
                                ))}
                              </ul>
                            ) : (
                              <div className="mt-1 text-xs text-muted-foreground">No configuration changes from v{prev.version}.</div>
                            )
                          ) : null}
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

// The last seven days as dates, for a scheduled agent's sample test input.
function lastWeek() {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  return { from: day(new Date(now.getTime() - 7 * 86_400_000)), to: day(now) };
}
