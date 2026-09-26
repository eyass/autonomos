import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { LevelChange, Scores, StatusBadge } from "@/components/domain";
import { Badge, Card, CardBody, CardHeader, Notice, PageHeader, RowLink, Stat } from "@/components/ui";
import { FREQUENCY_LABEL, hours, money, num, pct } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { generateOpportunitiesAction, setProcessStatusAction } from "../actions";
import { ProcessEditor } from "./editor";

const SOURCE_LABEL = { interview: "AI interview", document: "Imported document", integration: "Connected systems", manual: "Added manually" } as const;

export default async function ProcessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("processes")
    .select("*, departments(id, name, hourly_labour_cost), process_steps(*), process_systems(system), process_people(role), documents(title)")
    .eq("organization_id", session.org.id)
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();
  const [{ data: departments }, { data: opportunities }, { data: agents }] = await Promise.all([
    supabase.from("departments").select("id, name").eq("organization_id", session.org.id).is("archived_at", null).order("name"),
    supabase.from("automation_opportunities").select("id, title, status, target_autonomy_level, estimated_hours_saved_monthly").eq("organization_id", session.org.id).eq("process_id", id).order("created_at"),
    supabase.from("agents").select("id, name, status, autonomy_level, active_version_id").eq("organization_id", session.org.id).eq("process_id", id),
  ]);
  const dept = p.departments as unknown as { id: string; name: string; hourly_labour_cost: number | null } | null;
  const steps = ((p.process_steps as unknown as Array<{ id: string; position: number; title: string; description: string | null; system: string | null; performed_by: string | null; requires_judgement: boolean }>) ?? []).sort((a, b) => a.position - b.position);
  const systems = ((p.process_systems as unknown as Array<{ system: string }>) ?? []).map((s) => s.system);
  const roles = ((p.process_people as unknown as Array<{ role: string }>) ?? []).map((r) => r.role);
  const monthlyMinutes = Number(p.estimated_occurrences_per_month ?? 0) * Number(p.estimated_minutes_per_occurrence ?? 0);
  const rate = dept?.hourly_labour_cost ? Number(dept.hourly_labour_cost) : session.org.defaultHourlyCost;
  const activeAgent = (agents ?? []).filter((a) => a.status === "active").sort((a, b) => b.autonomy_level - a.autonomy_level)[0];
  const effective = Math.max(p.current_autonomy_level, activeAgent?.autonomy_level ?? 1);

  let policies: string[] = [];
  const versionIds = (agents ?? []).map((a) => a.active_version_id).filter(Boolean) as string[];
  if (versionIds.length) {
    const { data: versions } = await supabase.from("agent_versions").select("instructions").in("id", versionIds);
    policies = [...new Set((versions ?? []).flatMap((v) => ((v.instructions as { rules?: string[] })?.rules ?? [])))];
  }

  return (
    <>
      <PageHeader
        back={{ href: "/processes", label: "Processes" }}
        title={p.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={p.status} />
            <span>{dept?.name ?? "No department"}</span>
            {p.confidence !== null && Number(p.confidence) < 0.6 ? <Badge tone="warn">AI confidence {pct(Number(p.confidence))}</Badge> : null}
          </span>
        }
        actions={
          <>
            {p.status === "draft" ? (
              <ActionButton action={setProcessStatusAction.bind(null, id, "reviewed")}>Approve process</ActionButton>
            ) : null}
            {p.status !== "draft" && p.status !== "archived" ? (
              <ActionButton action={generateOpportunitiesAction.bind(null, id)} pendingLabel="Analysing…">
                Create automation opportunity
              </ActionButton>
            ) : null}
            {p.status !== "archived" ? (
              <ActionButton variant="ghost" confirm="Archive this process?" action={setProcessStatusAction.bind(null, id, "archived")}>
                Archive
              </ActionButton>
            ) : (
              <ActionButton variant="secondary" action={setProcessStatusAction.bind(null, id, "draft")}>
                Restore
              </ActionButton>
            )}
          </>
        }
      />

      {p.status === "draft" ? (
        <Notice tone="info" className="mb-4">
          AI-generated processes are drafts until someone who knows the work reviews them. Check the steps and numbers, fix anything wrong, then approve.
        </Notice>
      ) : null}
      {p.missing_information.length ? (
        <Notice tone="warn" className="mb-4">
          <div className="font-medium">Missing information</div>
          <ul className="mt-1 list-inside list-disc">
            {p.missing_information.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Human time"
          value={`${hours(monthlyMinutes)}`}
          hint={p.estimated_occurrences_per_month ? `${num(Number(p.estimated_occurrences_per_month))}× a month${p.estimated_minutes_per_occurrence ? `, ${num(Number(p.estimated_minutes_per_occurrence))} min each` : ""}` : FREQUENCY_LABEL[p.frequency]}
        />
        <Stat label="Estimated cost" value={money((monthlyMinutes / 60) * rate, session.org.currency)} hint={`per month at ${money(rate, session.org.currency)}/h`} />
        <Stat label="Autonomy" value={<LevelChange from={effective} to={p.potential_autonomy_level} />} hint={activeAgent ? `with ${activeAgent.name}` : "now → potential"} />
        <Card className="px-4 py-3">
          <div className="mb-2 text-xs font-medium text-muted">Scores</div>
          <Scores value={p.business_value} difficulty={p.automation_difficulty} risk={p.risk_level} className="flex-col items-start gap-1.5" />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Workflow" description={p.trigger ? `Starts when: ${p.trigger}` : "How the work is done today"} />
            <CardBody>
              {steps.length ? (
                <ol className="space-y-3">
                  {steps.map((s) => (
                    <li key={s.id} className="flex gap-3 text-sm">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs tabular-nums">{s.position}</span>
                      <div className="min-w-0">
                        <div>{s.title}</div>
                        <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted">
                          {s.performed_by ? <span>{s.performed_by}</span> : null}
                          {s.system ? <Badge>{s.system}</Badge> : null}
                          {s.requires_judgement ? <Badge tone="warn">judgement</Badge> : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted">No steps recorded yet. Edit the process to add them.</p>
              )}
            </CardBody>
          </Card>
          <ProcessEditor
            id={id}
            departments={departments ?? []}
            initial={{
              title: p.title,
              description: p.description,
              departmentId: p.department_id,
              trigger: p.trigger,
              frequency: p.frequency,
              estimatedOccurrencesPerMonth: p.estimated_occurrences_per_month === null ? null : Number(p.estimated_occurrences_per_month),
              estimatedMinutesPerOccurrence: p.estimated_minutes_per_occurrence === null ? null : Number(p.estimated_minutes_per_occurrence),
              currentAutonomyLevel: p.current_autonomy_level,
              potentialAutonomyLevel: p.potential_autonomy_level,
              businessValue: p.business_value,
              automationDifficulty: p.automation_difficulty,
              riskLevel: p.risk_level,
              notes: p.notes,
              steps: steps.map((s) => ({ title: s.title, system: s.system ?? undefined, performedBy: s.performed_by ?? undefined, requiresJudgement: s.requires_judgement })),
              systems,
              roles,
            }}
          />
        </div>
        <div className="space-y-6">
          {opportunities?.length || agents?.length ? (
            <Card>
              <CardHeader title="Opportunities and agents" />
              <div>
                {(agents ?? []).map((a) => (
                  <RowLink key={a.id} href={`/agents/${a.id}`} title={a.name} meta={<span>Agent · L{a.autonomy_level}</span>} aside={<StatusBadge status={a.status} />} />
                ))}
                {(opportunities ?? []).map((o) => (
                  <RowLink key={o.id} href={`/opportunities/${o.id}`} title={o.title} meta={<span>Opportunity · target L{o.target_autonomy_level}</span>} aside={<StatusBadge status={o.status} />} />
                ))}
              </div>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Details" />
            <CardBody className="space-y-4 text-sm">
              <div>
                <div className="mb-1 text-xs font-medium text-muted">Systems used</div>
                <div className="flex flex-wrap gap-1">{systems.length ? systems.map((s) => <Badge key={s}>{s}</Badge>) : <span className="text-muted">–</span>}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted">Roles involved</div>
                <div className="flex flex-wrap gap-1">{roles.length ? roles.map((r) => <Badge key={r}>{r}</Badge>) : <span className="text-muted">–</span>}</div>
              </div>
              {p.exceptions.length ? (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted">Exceptions</div>
                  <ul className="list-inside list-disc text-muted">
                    {p.exceptions.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {policies.length ? (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted">Policies used by agents</div>
                  <ul className="list-inside list-disc text-muted">
                    {policies.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div>
                <div className="mb-1 text-xs font-medium text-muted">Source</div>
                <div>
                  {SOURCE_LABEL[p.discovery_source]}
                  {(p.documents as unknown as { title: string } | null)?.title ? <span className="text-muted"> · {(p.documents as unknown as { title: string }).title}</span> : null}
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
