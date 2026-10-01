import { modeOf } from "@autonomos/schemas";
import { getTool } from "@autonomos/integrations";
import { registerWorkspaceTools } from "@/server/tool-catalog";
import { reconcileStuckRuns } from "@/server/run-health";
import { Activity, ChevronDown, CircleCheck, CircleDot, CircleSlash, Hand, Play, ShieldCheck, Sparkles, TriangleAlert, UserRound, Wrench, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { notFound } from "next/navigation";
import { OutcomeBadge, StatusBadge } from "@/components/domain";
import { dateTime, hours, time, aiMoney } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Feedback } from "./feedback";
import { LiveRefresh } from "./live";
import { ButtonLink } from "@/components/app/button-link";
import { DefinitionList } from "@/components/app/definition-list";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { runTitle } from "@/lib/titles";

const STEP_TONE: Record<string, string> = {
  succeeded: "bg-success-soft text-success",
  failed: "bg-destructive-soft text-destructive",
  waiting: "bg-warning-soft text-warning",
  simulated: "bg-info-soft text-info",
  skipped: "bg-muted text-muted-foreground",
};

// What kind of step it was, so the timeline reads at a glance. Reasoning is the agent's own
// work and carries the signal colour; everything else takes the tone of its outcome.
const STEP_KIND: Record<string, { label: string; icon: LucideIcon }> = {
  trigger: { label: "Trigger", icon: Zap },
  decision: { label: "Reasoning", icon: Sparkles },
  tool: { label: "Tool", icon: Wrench },
  action: { label: "Action", icon: Play },
  policy: { label: "Policy", icon: ShieldCheck },
  approval_requested: { label: "Approval", icon: Hand },
  approval: { label: "Approval", icon: Hand },
  escalated: { label: "Handed off", icon: UserRound },
  manual_completion: { label: "Person", icon: UserRound },
  completed: { label: "Finished", icon: CircleCheck },
  exception: { label: "Error", icon: TriangleAlert },
  failed: { label: "Error", icon: TriangleAlert },
  cancelled: { label: "Cancelled", icon: CircleSlash },
};

export async function generateMetadata({ params }: { params: Promise<{ runId: string }> }) {
  return runTitle((await params).runId);
}

export default async function RunPage({ params, searchParams }: { params: Promise<{ runId: string }>; searchParams: Promise<{ built?: string }> }) {
  const { runId } = await params;
  const { built } = await searchParams;
  const session = await requireSession();
  await registerWorkspaceTools(session.org.id);
  await reconcileStuckRuns(session.org.id);
  const supabase = await createClient();
  const { data: run } = await supabase
    .from("agent_runs")
    .select("*, agents(id, name), processes(id, title), agent_versions(version, autonomy_level)")
    .eq("organization_id", session.org.id)
    .eq("id", runId)
    .maybeSingle();
  if (!run) notFound();
  const [{ data: steps }, { data: interventions }, { data: approvals }, { data: feedback }] = await Promise.all([
    supabase.from("agent_run_steps").select("*").eq("organization_id", session.org.id).eq("agent_run_id", runId).order("sequence"),
    supabase.from("human_interventions").select("type, description, minutes_spent, created_at").eq("organization_id", session.org.id).eq("agent_run_id", runId).order("created_at"),
    supabase.from("approval_requests").select("id, status, title").eq("organization_id", session.org.id).eq("agent_run_id", runId),
    supabase.from("agent_feedback").select("verdict").eq("organization_id", session.org.id).eq("agent_run_id", runId).eq("user_id", session.user.id).maybeSingle(),
  ]);
  const agent = run.agents as unknown as { id: string; name: string };
  const proc = run.processes as unknown as { id: string; title: string };
  const version = run.agent_versions as unknown as { version: number; autonomy_level: number };
  // A run nobody picked up, or one that stopped reporting, is shown as stuck and the page stops
  // refreshing instead of polling forever.
  const stuck = isStuck(run);
  const active = ["queued", "running"].includes(run.status) && !stuck;
  const duration = run.started_at && run.finished_at ? (new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000 : null;
  const lastDecision = [...(steps ?? [])].reverse().find((s) => s.type === "decision");
  const output = (run.output ?? {}) as { result?: string; wouldRequireApproval?: Array<{ tool: string; args: Record<string, unknown>; reasons: string[] }> };
  const pending = (approvals ?? []).find((a) => a.status === "pending");

  return (
    <>
      <LiveRefresh active={active} />
      <PageHeader
        back={{ href: "/activity", label: "Activity" }}
        icon={Activity}
        tone={active || pending ? "agent" : "violet"}
        title={`${agent.name}${run.mode === "test" ? " · test run" : ""}`}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge status={run.status} />
            <OutcomeBadge outcome={run.outcome} mode={run.mode} />
            <Link href={`/processes/${proc.id}`} className="hover:underline">
              {proc.title}
            </Link>
            <span>
              · v{version.version} · {modeOf(version.autonomy_level).name} · {dateTime(run.queued_at)}
            </span>
          </span>
        }
        actions={
          <ButtonLink href={`/agents/${agent.id}`} variant="outline">
            Open agent
          </ButtonLink>
        }
      />
      {built ? (
        <Alert variant="success" className="mb-4">
          <AlertDescription>
            AutonomOS built {agent.name} and started a test run. Actions that would change something are simulated, never executed. When the result looks right, open the agent to activate it.
          </AlertDescription>
        </Alert>
      ) : null}
      {stuck ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            {run.status === "queued"
              ? "This run was never picked up, so nothing has happened yet. Agents cannot run in this workspace right now: check Settings, Execution, or contact support."
              : "This run stopped reporting progress. It may have been cut off; start it again from the agent."}{" "}
            <Link href={`/agents/${agent.id}`} className="font-medium underline">
              Open the agent
            </Link>
          </AlertDescription>
        </Alert>
      ) : run.status === "queued" ? (
        <Alert variant="info" className="mb-4">
          <AlertDescription>Queued. It starts in a moment. If it is still waiting after a few minutes, ask your administrator to check that agents can run (Settings, Execution).</AlertDescription>
        </Alert>
      ) : null}
      {pending ? (
        <Alert variant="warning" className="mb-4">
          <AlertDescription>
            Waiting for approval: {pending.title}{" "}
            <Link href="/approvals" className="font-medium underline">
              Review it
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      {run.error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            {run.error_retryable ? "Temporary error, retrying: " : "Error: "}
            {run.error}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="mb-6">
        <CardContent className="space-y-4">
          <p className="text-sm">{run.summary ?? "In progress"}</p>
          <DefinitionList
            className="sm:grid-cols-4"
            items={[
              { label: "Time saved", value: hours(Number(run.estimated_minutes_saved ?? 0)) },
              { label: "Human time", value: `${Number(run.human_minutes)} min` },
              { label: "AI cost", value: <span title={`${run.input_tokens + run.output_tokens} tokens`}>{aiMoney(Number(run.model_cost), session.org.currency)}</span> },
              { label: "Duration", value: duration === null ? "–" : `${duration.toFixed(1)} s` },
            ]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>What happened</CardTitle>
            <CardDescription>Every material step, in order.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-4 before:absolute before:top-3 before:bottom-3 before:left-[13px] before:w-px before:bg-border">
              {timelineRows(steps ?? []).map(({ step: s, decision, title }) => {
                const kind = STEP_KIND[s.type] ?? { label: s.type.replaceAll("_", " "), icon: CircleDot };
                return (
                  <li key={s.id} className="relative flex gap-3">
                    <span
                      aria-hidden
                      className={cn(
                        "relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ring-4 ring-card",
                        s.type === "decision" ? "bg-highlight-soft text-highlight-strong" : (STEP_TONE[s.status] ?? "bg-muted text-muted-foreground"),
                      )}
                    >
                      <kind.icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-baseline gap-2 text-sm">
                      <span className="eyebrow text-[11px] text-muted-foreground">{kind.label}</span>
                      <span className="tabular-nums text-xs text-muted-foreground">{time(s.created_at)}</span>
                      <span className="min-w-0 font-medium break-words">{title}</span>
                      {s.tool && (getTool(s.tool)?.label ?? s.tool) !== title ? <Badge variant="secondary">{getTool(s.tool)?.label ?? s.tool}</Badge> : null}
                      {s.status === "simulated" ? <Badge variant="info">simulated</Badge> : null}
                    </div>
                    {s.type === "approval_requested" ? (
                      <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                        {((s.output as { reasons?: string[] } | null)?.reasons ?? []).map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    ) : null}
                    {decision?.reasoningSummary && decision.reasoningSummary !== title ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {decision.reasoningSummary}
                        {decision.confidence !== undefined ? ` (confidence ${Math.round(decision.confidence * 100)}%)` : ""}
                      </p>
                    ) : null}
                    {s.type !== "decision" && (s.input || s.output) ? (
                      <Collapsible className="mt-1 text-xs">
                        <CollapsibleTrigger className="group -my-1 inline-flex min-h-7 items-center gap-1 text-muted-foreground hover:text-foreground">
                          Data
                          <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-1 grid gap-2 md:grid-cols-2 [&>*]:min-w-0">
                            {s.input ? <pre className="overflow-x-auto rounded bg-muted p-2">{JSON.stringify(s.input, null, 2)}</pre> : null}
                            {s.output ? <pre className="overflow-x-auto rounded bg-muted p-2">{JSON.stringify(s.output, null, 2)}</pre> : null}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ) : null}
                    </div>
                  </li>
                );
              })}
              {active ? (
                <li className="relative flex items-center gap-3 text-sm text-muted-foreground">
                  <span aria-hidden className="relative z-10 flex size-7 items-center justify-center rounded-full bg-highlight-soft ring-4 ring-card">
                    <span className="signal-pulse size-2 rounded-full bg-highlight" />
                  </span>
                  Working…
                </li>
              ) : null}
            </ol>
          </CardContent>
        </Card>
        <div className="space-y-6">
          {run.mode === "test" && output.wouldRequireApproval?.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Approvals needed in production</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {output.wouldRequireApproval.map((w, i) => (
                  <div key={i}>
                    <div className="font-medium">{getTool(w.tool)?.label ?? w.tool}</div>
                    <div className="text-xs text-muted-foreground">{w.reasons.join("; ")}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Human involvement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(interventions ?? []).map((i, n) => (
                <div key={n}>
                  <Badge variant="warning">{i.type.replaceAll("_", " ")}</Badge> {i.description}
                </div>
              ))}
              {!interventions?.length && run.outcome === "escalated" ? (
                <div>
                  <Badge variant="warning">handed to a human</Badge> {run.summary}
                  {run.mode === "test" ? <p className="mt-1 text-xs text-muted-foreground">A test: in production this would go to a person. Not counted as human time.</p> : null}
                </div>
              ) : null}
              {!interventions?.length && run.outcome !== "escalated" ? <p className="text-muted-foreground">None</p> : null}
              <Collapsible className="pt-2 text-xs">
                <CollapsibleTrigger className="group -my-1 inline-flex min-h-7 items-center gap-1 text-muted-foreground hover:text-foreground">
                  Run input
                  <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-2 overflow-x-auto rounded bg-muted p-2">{JSON.stringify(run.input, null, 2)}</pre>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
          {lastDecision && !active ? (
            <Card>
              <CardHeader>
                <CardTitle>Was this right?</CardTitle>
                <CardDescription>Feedback is stored for evaluating the agent.</CardDescription>
              </CardHeader>
              <CardContent>
                <Feedback runId={runId} current={feedback?.verdict ?? null} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

// Queued for 3 minutes means no worker took it; running for 15 means it stopped reporting.
function isStuck(run: { status: string; queued_at: string; started_at: string | null }) {
  const idle = Date.now() - new Date(run.started_at ?? run.queued_at).getTime();
  return (run.status === "queued" && idle > 3 * 60_000) || (run.status === "running" && idle > 15 * 60_000);
}

// The agent decides, then acts: a decision followed straight away by the tool call, action or
// approval it chose is shown as one row, titled with what the agent set out to do and carrying
// its reasoning. Decisions that lead to nothing further (the final answer) keep their own row.
type Decision = { reasoningSummary?: string; confidence?: number; proposedTool?: string };
const ACTS = new Set(["tool", "action", "approval_requested"]);

function timelineRows<S extends { type: string; description: string; output: unknown }>(steps: S[]) {
  const rows: Array<{ step: S; decision: Decision | null; title: string }> = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const next = steps[i + 1];
    if (s.type === "decision" && next && ACTS.has(next.type)) {
      rows.push({ step: next, decision: s.output as Decision, title: s.description || next.description });
      i++;
      continue;
    }
    rows.push({ step: s, decision: s.type === "decision" ? (s.output as Decision) : null, title: s.description });
  }
  return rows;
}
