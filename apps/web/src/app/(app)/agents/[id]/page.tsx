import { autonomyRecommendation } from "@autonomos/agents";
import { computeOrgMetrics } from "@autonomos/db";
import { getTool, SAMPLE_TICKETS } from "@autonomos/integrations";
import { INTEGRATION_EVENTS } from "@autonomos/schemas";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { AutonomyLadder, OutcomeBadge, StatusBadge } from "@/components/domain";
import { Badge, ButtonLink, Card, CardBody, CardHeader, Notice, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { dateTime, hours, money, pct, relative, usd } from "@/lib/format";
import { adminDb, HttpError, isAdmin, requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { loadAgentConfig } from "@/server/agents";
import { activateAction, pauseAction } from "../actions";
import { AutonomyControl, LivePanel, TestPanel } from "./controls";

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
    supabase.from("agent_versions").select("id, version, autonomy_level, change_note, created_at, users:created_by(first_name, last_name)").eq("organization_id", session.org.id).eq("agent_id", id).order("version", { ascending: false }),
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
      <div className="mb-2 text-sm">
        <Link href="/agents" className="text-muted hover:text-foreground">
          Agents
        </Link>
      </div>
      <PageHeader
        title={agent.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={agent.status} />
            <AutonomyLadder current={agent.autonomy_level} size="sm" />
            <span>
              runs <Link className="hover:underline" href={`/processes/${process?.id}`}>{process?.title}</Link>
            </span>
            <Badge>version {version.version}</Badge>
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/agents/${id}/edit`} variant="secondary">
              Edit
            </ButtonLink>
            {agent.status === "active" ? (
              <ActionButton variant="secondary" action={pauseAction.bind(null, id)}>
                Pause
              </ActionButton>
            ) : isAdmin(session) ? (
              <ActionButton action={activateAction.bind(null, id)}>Activate agent</ActionButton>
            ) : null}
          </>
        }
      />

      {created ? (
        <Notice tone="ok" className="mb-6">
          Agent created in draft. Run a test below to see exactly what it would do, then activate it.
        </Notice>
      ) : null}
      {agent.status !== "active" && !hasCompletedTest ? (
        <Notice tone="info" className="mb-6">
          This agent is not live. Run at least one test before activating it.
        </Notice>
      ) : null}
      {recommendation ? (
        <Notice tone={recommendation.direction === "increase" ? "ok" : "warn"} className="mb-6">
          <div className="font-medium">{recommendation.message}</div>
          <div className="mt-1 text-xs">{recommendation.evidence.join(" · ")}</div>
          <a href="#autonomy" className="mt-2 inline-block text-xs font-medium underline">
            Review autonomy
          </a>
        </Notice>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <Stat label="Runs" value={stats?.runs ?? 0} hint={stats?.testRuns ? `${stats.testRuns} test runs` : undefined} />
        <Stat label="Success rate" value={pct(stats?.successRate)} />
        <Stat label="Automation rate" value={pct(stats?.automationRate)} hint="no human needed" />
        <Stat label="Human intervention" value={pct(stats?.humanInterventionRate)} />
        <Stat label="Hours saved" value={hours((stats?.hoursSaved ?? 0) * 60)} hint="estimate" />
        <Stat label="Estimated value" value={money(stats?.estimatedValue ?? 0, session.org.currency)} />
        <Stat label="AI cost" value={usd(stats?.aiCost ?? 0)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Recent runs" />
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Result</Th>
                  <Th>Summary</Th>
                  <Th>Version</Th>
                  <Th>Saved</Th>
                  <Th>Cost</Th>
                </tr>
              </thead>
              <tbody>
                {(runs ?? []).map((r) => (
                  <tr key={r.id} className="hover:bg-surface-muted/50">
                    <Td className="whitespace-nowrap">
                      <Link href={`/activity/${r.id}`} className="hover:underline">
                        {relative(r.queued_at)}
                      </Link>
                    </Td>
                    <Td>{r.outcome ? <OutcomeBadge outcome={r.outcome} mode={r.mode} /> : <StatusBadge status={r.status} />}</Td>
                    <Td className="max-w-xs truncate text-muted">{r.summary ?? "–"}</Td>
                    <Td>v{(r.agent_versions as unknown as { version: number } | null)?.version}</Td>
                    <Td>{hours(Number(r.estimated_minutes_saved ?? 0))}</Td>
                    <Td>{usd(Number(r.model_cost))}</Td>
                  </tr>
                ))}
                {!runs?.length ? (
                  <tr>
                    <Td colSpan={6} className="py-6 text-center text-muted">
                      No runs yet.
                    </Td>
                  </tr>
                ) : null}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Current configuration" description={`Version ${version.version}`} />
            <CardBody className="grid gap-5 text-sm md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-muted">Objective</div>
                <p>{config.instructions.objective}</p>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted">Trigger</div>
                <p>{triggerLabel}</p>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted">What the agent can do</div>
                <ul className="space-y-0.5">
                  {config.tools.map((t) => {
                    const def = getTool(t);
                    return (
                      <li key={t} className="flex items-center gap-2">
                        {def?.label ?? t} {def?.access === "write" ? <Badge tone="info">takes action</Badge> : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted">Rules</div>
                <ul className="list-inside list-disc">
                  {config.instructions.rules.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted">Needs your approval when</div>
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
                <div className="mb-1 text-xs font-medium text-muted">Hands to a human when</div>
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
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Version history" />
            <Table>
              <tbody>
                {(versions ?? []).map((v) => {
                  const by = v.users as unknown as { first_name: string; last_name: string } | null;
                  return (
                    <tr key={v.id}>
                      <Td className="w-16 font-medium">v{v.version}</Td>
                      <Td>{v.change_note ?? "–"}</Td>
                      <Td>L{v.autonomy_level}</Td>
                      <Td className="text-muted">{by ? `${by.first_name} ${by.last_name}` : "–"}</Td>
                      <Td className="whitespace-nowrap text-muted">{dateTime(v.created_at)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </div>
        <div className="space-y-6">
          <TestPanel agentId={id} ticketDriven={ticketDriven} samples={samples} />
          {agent.status === "active" ? <LivePanel agentId={id} samples={samples} ticketDriven={ticketDriven} sandbox={zendesk?.provider === "sandbox"} /> : null}
          <Card id="autonomy">
            <CardHeader title="Autonomy" />
            <CardBody>
              <AutonomyControl agentId={id} level={agent.autonomy_level} hasMoney={config.tools.includes("stripe.create_refund")} threshold={refundThreshold} canChange={isAdmin(session)} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
