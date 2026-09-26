import { getTool } from "@autonomos/integrations";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { notFound } from "next/navigation";
import { OutcomeBadge, StatusBadge } from "@/components/domain";
import { dateTime, hours, time, usd } from "@/lib/format";
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

const STEP_TONE: Record<string, string> = { succeeded: "bg-success", failed: "bg-destructive", waiting: "bg-warning", simulated: "bg-info", skipped: "bg-muted-foreground" };

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const session = await requireSession();
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
  const active = ["queued", "running"].includes(run.status);
  const duration = run.started_at && run.finished_at ? (new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000 : null;
  const lastDecision = [...(steps ?? [])].reverse().find((s) => s.type === "decision");
  const output = (run.output ?? {}) as { result?: string; wouldRequireApproval?: Array<{ tool: string; args: Record<string, unknown>; reasons: string[] }> };
  const pending = (approvals ?? []).find((a) => a.status === "pending");

  return (
    <>
      <LiveRefresh active={active} />
      <PageHeader
        back={{ href: "/activity", label: "Activity" }}
        title={`${agent.name}${run.mode === "test" ? " · test run" : ""}`}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge status={run.status} />
            <OutcomeBadge outcome={run.outcome} mode={run.mode} />
            <Link href={`/processes/${proc.id}`} className="hover:underline">
              {proc.title}
            </Link>
            <span>
              · v{version.version} · L{version.autonomy_level} · {dateTime(run.queued_at)}
            </span>
          </span>
        }
        actions={
          <ButtonLink href={`/agents/${agent.id}`} variant="outline">
            Open agent
          </ButtonLink>
        }
      />
      {run.status === "queued" ? (
        <Alert variant="info" className="mb-4">
          <AlertDescription>Queued on the durable runtime. If this stays queued, check that the Trigger.dev worker is running.</AlertDescription>
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
              { label: "AI cost", value: <span title={`${run.input_tokens + run.output_tokens} tokens`}>{usd(Number(run.model_cost))}</span> },
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
            <ol className="relative ml-1 space-y-4 border-l border-border pl-5">
              {(steps ?? []).map((s) => {
                const decision = s.type === "decision" ? (s.output as { reasoningSummary?: string; confidence?: number; proposedTool?: string }) : null;
                return (
                  <li key={s.id} className="relative">
                    <span className={cn("absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full", STEP_TONE[s.status] ?? "bg-muted-foreground")} />
                    <div className="flex flex-wrap items-baseline gap-2 text-sm">
                      <span className="tabular-nums text-xs text-muted-foreground">{time(s.created_at)}</span>
                      <span className="min-w-0 font-medium break-words">{s.description}</span>
                      {s.tool && (getTool(s.tool)?.label ?? s.tool) !== s.description ? <Badge variant="secondary">{getTool(s.tool)?.label ?? s.tool}</Badge> : null}
                      {s.status === "simulated" ? <Badge variant="info">simulated</Badge> : null}
                    </div>
                    {s.type === "approval_requested" ? (
                      <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                        {((s.output as { reasons?: string[] } | null)?.reasons ?? []).map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    ) : null}
                    {decision?.reasoningSummary && decision.reasoningSummary !== s.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {decision.reasoningSummary}
                        {decision.confidence !== undefined ? ` (confidence ${Math.round(decision.confidence * 100)}%)` : ""}
                      </p>
                    ) : null}
                    {s.type !== "decision" && (s.input || s.output) ? (
                      <Collapsible className="mt-1 text-xs">
                        <CollapsibleTrigger className="group inline-flex items-center gap-1 text-muted-foreground">
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
                  </li>
                );
              })}
              {active ? <li className="text-sm text-muted-foreground">Working…</li> : null}
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
              {!interventions?.length ? <p className="text-muted-foreground">None</p> : null}
              <Collapsible className="pt-2 text-xs">
                <CollapsibleTrigger className="group inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
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
