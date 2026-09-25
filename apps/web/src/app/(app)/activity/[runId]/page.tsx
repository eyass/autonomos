import { getTool } from "@autonomos/integrations";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OutcomeBadge, StatusBadge } from "@/components/domain";
import { Badge, ButtonLink, Card, CardBody, CardHeader, Notice, PageHeader, Stat } from "@/components/ui";
import { dateTime, hours, time, usd } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Feedback } from "./feedback";
import { LiveRefresh } from "./live";

const STEP_TONE: Record<string, string> = { succeeded: "bg-ok", failed: "bg-danger", waiting: "bg-warn", simulated: "bg-info", skipped: "bg-muted" };

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
  const toolsUsed = [...new Set((steps ?? []).map((s) => s.tool).filter(Boolean) as string[])];
  const duration = run.started_at && run.finished_at ? (new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000 : null;
  const lastDecision = [...(steps ?? [])].reverse().find((s) => s.type === "decision");
  const output = (run.output ?? {}) as { result?: string; wouldRequireApproval?: Array<{ tool: string; args: Record<string, unknown>; reasons: string[] }> };
  const pending = (approvals ?? []).find((a) => a.status === "pending");

  return (
    <>
      <LiveRefresh active={active} />
      <div className="mb-2 text-sm">
        <Link href="/activity" className="text-muted hover:text-foreground">
          Activity
        </Link>
      </div>
      <PageHeader
        title={`${agent.name}${run.mode === "test" ? " · test run" : ""}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={run.status} />
            <OutcomeBadge outcome={run.outcome} mode={run.mode} />
            <span>
              <Link href={`/processes/${proc.id}`} className="hover:underline">
                {proc.title}
              </Link>{" "}
              · v{version.version} · L{version.autonomy_level} · {dateTime(run.queued_at)}
            </span>
          </span>
        }
        actions={<ButtonLink href={`/agents/${agent.id}`} variant="secondary">Open agent</ButtonLink>}
      />
      {run.status === "queued" ? (
        <Notice tone="info" className="mb-6">
          Queued on the durable runtime. If this stays queued, check that the Trigger.dev worker is running.
        </Notice>
      ) : null}
      {pending ? (
        <Notice tone="warn" className="mb-6">
          Waiting for approval: {pending.title}{" "}
          <Link href="/approvals" className="font-medium underline">
            Review it
          </Link>
        </Notice>
      ) : null}
      {run.error ? (
        <Notice tone="danger" className="mb-6">
          {run.error_retryable ? "Temporary error, retrying: " : "Error: "}
          {run.error}
        </Notice>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Result" value={<span className="text-base">{run.summary ?? "In progress"}</span>} className="sm:col-span-3 lg:col-span-2" />
        <Stat label="Time saved" value={hours(Number(run.estimated_minutes_saved ?? 0))} hint={run.baseline_minutes ? `baseline ${Number(run.baseline_minutes)} min` : undefined} />
        <Stat label="Human time" value={`${Number(run.human_minutes)} min`} />
        <Stat label="AI cost" value={usd(Number(run.model_cost))} hint={`${run.input_tokens + run.output_tokens} tokens`} />
        <Stat label="Duration" value={duration === null ? "–" : `${duration.toFixed(1)} s`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="What happened" description="Every material step, in order." />
          <CardBody>
            <ol className="relative space-y-4 border-l border-border pl-5">
              {(steps ?? []).map((s) => {
                const decision = s.type === "decision" ? (s.output as { reasoningSummary?: string; confidence?: number; proposedTool?: string }) : null;
                return (
                  <li key={s.id} className="relative">
                    <span className={cn("absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full", STEP_TONE[s.status] ?? "bg-muted")} />
                    <div className="flex flex-wrap items-baseline gap-2 text-sm">
                      <span className="tabular-nums text-xs text-muted">{time(s.created_at)}</span>
                      <span className="font-medium">{s.description}</span>
                      {s.tool ? <Badge>{getTool(s.tool)?.label ?? s.tool}</Badge> : null}
                      {s.status === "simulated" ? <Badge tone="info">simulated</Badge> : null}
                    </div>
                    {s.type === "approval_requested" ? (
                      <ul className="mt-1 list-inside list-disc text-xs text-muted">
                        {((s.output as { reasons?: string[] } | null)?.reasons ?? []).map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    ) : null}
                    {decision?.reasoningSummary && decision.reasoningSummary !== s.description ? (
                      <p className="mt-1 text-sm text-muted">
                        {decision.reasoningSummary}
                        {decision.confidence !== undefined ? ` (confidence ${Math.round(decision.confidence * 100)}%)` : ""}
                      </p>
                    ) : null}
                    {s.type !== "decision" && (s.input || s.output) ? (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-muted">Data</summary>
                        <div className="mt-1 grid gap-2 md:grid-cols-2">
                          {s.input ? <pre className="overflow-x-auto rounded bg-surface-muted p-2">{JSON.stringify(s.input, null, 2)}</pre> : null}
                          {s.output ? <pre className="overflow-x-auto rounded bg-surface-muted p-2">{JSON.stringify(s.output, null, 2)}</pre> : null}
                        </div>
                      </details>
                    ) : null}
                  </li>
                );
              })}
              {active ? <li className="text-sm text-muted">Working…</li> : null}
            </ol>
          </CardBody>
        </Card>
        <div className="space-y-6">
          {run.mode === "test" && output.wouldRequireApproval?.length ? (
            <Card>
              <CardHeader title="Approvals needed in production" />
              <CardBody className="space-y-2 text-sm">
                {output.wouldRequireApproval.map((w, i) => (
                  <div key={i}>
                    <div className="font-medium">{getTool(w.tool)?.label ?? w.tool}</div>
                    <div className="text-xs text-muted">{w.reasons.join("; ")}</div>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Input" />
            <CardBody>
              <pre className="overflow-x-auto rounded bg-surface-muted p-2 text-xs">{JSON.stringify(run.input, null, 2)}</pre>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Tools used" />
            <CardBody className="flex flex-wrap gap-1.5">
              {toolsUsed.length ? toolsUsed.map((t) => <Badge key={t}>{getTool(t)?.label ?? t}</Badge>) : <span className="text-sm text-muted">None</span>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Human involvement" />
            <CardBody className="space-y-2 text-sm">
              {(interventions ?? []).map((i, n) => (
                <div key={n}>
                  <Badge tone="warn">{i.type.replaceAll("_", " ")}</Badge> {i.description}
                </div>
              ))}
              {!interventions?.length ? <p className="text-muted">None</p> : null}
            </CardBody>
          </Card>
          {lastDecision && !active ? (
            <Card>
              <CardHeader title="Was this right?" description="Feedback is stored for evaluating the agent." />
              <CardBody>
                <Feedback runId={runId} current={feedback?.verdict ?? null} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
