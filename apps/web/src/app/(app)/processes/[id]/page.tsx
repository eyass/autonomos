import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { LevelChange, Scores, StatusBadge } from "@/components/domain";
import { FREQUENCY_LABEL, hours, money, num, pct } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { approveProcessAction, generateOpportunitiesAction, setProcessStatusAction } from "../actions";
import { ProcessEditor } from "./editor";
import { PageHeader } from "@/components/app/page-header";
import { RowLink } from "@/components/app/row-link";
import { StatStrip } from "@/components/app/stat-card";
import { processGaps } from "@/lib/process-gaps";
import { LifecycleHelp } from "@/components/app/lifecycle-help";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SOURCE_LABEL = { interview: "AI interview", document: "Imported document", integration: "Connected systems", manual: "Added manually", website: "Drafted from your website" } as const;

export default async function ProcessPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params;
  const { edit } = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("processes")
    .select("*, departments(id, name, hourly_labour_cost), process_steps(*), process_systems(system), process_people(role), documents(title)")
    .eq("organization_id", session.org.id)
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();
  const [{ data: departments }, { data: opportunities }, { data: agents }, { data: catalog }, { data: connected }, { data: knownSystems }, { data: knownRoles }] = await Promise.all([
    supabase.from("departments").select("id, name").eq("organization_id", session.org.id).is("archived_at", null).order("name"),
    supabase
      .from("automation_opportunities")
      .select("id, title, status, target_autonomy_level, estimated_hours_saved_monthly")
      .eq("organization_id", session.org.id)
      .eq("process_id", id)
      .order("created_at"),
    supabase.from("agents").select("id, name, status, autonomy_level, active_version_id").eq("organization_id", session.org.id).eq("process_id", id),
    supabase.from("integrations").select("key, name"),
    supabase.from("integration_connections").select("integration_key").eq("organization_id", session.org.id).eq("status", "connected"),
    supabase.from("process_systems").select("system").eq("organization_id", session.org.id).limit(300),
    supabase.from("process_people").select("role").eq("organization_id", session.org.id).limit(300),
  ]);
  const dept = p.departments as unknown as { id: string; name: string; hourly_labour_cost: number | null } | null;
  const steps = (
    (p.process_steps as unknown as Array<{
      id: string;
      position: number;
      title: string;
      description: string | null;
      system: string | null;
      performed_by: string | null;
      requires_judgement: boolean;
    }>) ?? []
  ).sort((a, b) => a.position - b.position);
  const systems = ((p.process_systems as unknown as Array<{ system: string }>) ?? []).map((s) => s.system);
  const roles = ((p.process_people as unknown as Array<{ role: string }>) ?? []).map((r) => r.role);
  const gaps = processGaps({ ...p, stepsCount: steps.length, systemsCount: systems.length });
  // Structured picks for the editor: connected systems first, then what other processes use.
  const connectedKeys = new Set((connected ?? []).map((c) => c.integration_key));
  const systemOptions = uniqueOptions([
    ...(catalog ?? []).filter((i) => connectedKeys.has(i.key)).map((i) => ({ value: i.name, hint: "Connected" })),
    ...(knownSystems ?? []).map((s) => ({ value: s.system, hint: "Used in another process" })),
    ...(session.org.detectedTools ?? []).map((t) => ({ value: t, hint: "Found on your website" })),
  ]);
  const roleOptions = uniqueOptions([
    ...(knownRoles ?? []).map((r) => ({ value: r.role, hint: "Used in another process" })),
    ...(departments ?? []).map((d) => ({ value: `${d.name} team`, hint: "Department" })),
  ]);
  const monthlyMinutes = Number(p.estimated_occurrences_per_month ?? 0) * Number(p.estimated_minutes_per_occurrence ?? 0);
  const rate = dept?.hourly_labour_cost ? Number(dept.hourly_labour_cost) : session.org.defaultHourlyCost;
  const activeAgent = (agents ?? []).filter((a) => a.status === "active").sort((a, b) => b.autonomy_level - a.autonomy_level)[0];
  const effective = Math.max(p.current_autonomy_level, activeAgent?.autonomy_level ?? 1);

  let policies: string[] = [];
  const versionIds = (agents ?? []).map((a) => a.active_version_id).filter(Boolean) as string[];
  if (versionIds.length) {
    const { data: versions } = await supabase.from("agent_versions").select("instructions").in("id", versionIds);
    policies = [...new Set((versions ?? []).flatMap((v) => (v.instructions as { rules?: string[] })?.rules ?? []))];
  }

  return (
    <>
      <PageHeader
        back={{ href: "/processes", label: "Work" }}
        title={p.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={p.status} />
            <span>{dept?.name ?? "No department"}</span>
            <LifecycleHelp kind="process" />
            {p.confidence !== null && Number(p.confidence) < 0.6 ? <Badge variant="warning">AI confidence {pct(Number(p.confidence))}</Badge> : null}
          </span>
        }
        actions={
          <>
            {p.status === "draft" ? (
              <ActionButton action={approveProcessAction.bind(null, id)} pendingLabel="Approving and finding automation ideas…">
                Approve process
              </ActionButton>
            ) : null}
            {p.status !== "draft" && p.status !== "archived" ? (
              <ActionButton action={generateOpportunitiesAction.bind(null, id)} pendingLabel="Analysing…">
                {opportunities?.length ? "Find more ideas" : "Find automation ideas"}
              </ActionButton>
            ) : null}
            {p.status !== "archived" ? (
              <ActionButton
                variant="ghost"
                confirm="Archive this process? It leaves lists and metrics; Restore undoes it."
                confirmLabel="Archive"
                action={setProcessStatusAction.bind(null, id, "archived")}
              >
                Archive
              </ActionButton>
            ) : (
              <ActionButton variant="outline" action={setProcessStatusAction.bind(null, id, "draft")}>
                Restore
              </ActionButton>
            )}
          </>
        }
      />

      {p.status === "draft" ? (
        <Alert variant="info" className="mb-4">
          <AlertDescription>Draft. Check the steps and numbers, then approve to find ideas for automating it.</AlertDescription>
        </Alert>
      ) : null}
      {gaps.length ? (
        <Alert variant="warning" className="mb-4">
          <AlertDescription>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">To make the numbers reliable, add</span>
              <Link href={`/processes/${id}?edit=1#edit`} className="text-xs font-medium underline">
                Add now
              </Link>
            </div>
            <ul className="mt-1 space-y-0.5">
              {gaps.map((m) => (
                <li key={m} className="flex items-start gap-2">
                  <span className="mt-1.5 size-2 shrink-0 rounded-sm border border-current" aria-hidden />
                  {m}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <StatStrip
        className="mb-6"
        items={[
          {
            label: "Human time",
            value: `${hours(monthlyMinutes)}/mo`,
            hint: p.estimated_occurrences_per_month
              ? `${num(Number(p.estimated_occurrences_per_month))}×${p.estimated_minutes_per_occurrence ? `, ${num(Number(p.estimated_minutes_per_occurrence))} min each` : ""}`
              : FREQUENCY_LABEL[p.frequency],
          },
          { label: "Cost", value: `${money((monthlyMinutes / 60) * rate, session.org.currency)}/mo`, hint: `at ${money(rate, session.org.currency)}/h` },
          { label: "Autonomy", value: <LevelChange from={effective} to={p.potential_autonomy_level} />, hint: activeAgent ? `with ${activeAgent.name}` : undefined },
          { label: "Scores", value: <Scores value={p.business_value} difficulty={p.automation_difficulty} risk={p.risk_level} className="mt-1 gap-x-2" /> },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Workflow</CardTitle>
              <CardDescription>{p.trigger ? `Starts when: ${p.trigger}` : "How the work is done today"}</CardDescription>
            </CardHeader>
            <CardContent>
              {steps.length ? (
                <ol className="space-y-3">
                  {steps.map((s) => (
                    <li key={s.id} className="flex gap-3 text-sm">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs tabular-nums">{s.position}</span>
                      <div className="min-w-0">
                        <div>{s.title}</div>
                        <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                          {s.performed_by ? <span>{s.performed_by}</span> : null}
                          {s.system ? <Badge variant="secondary">{s.system}</Badge> : null}
                          {s.requires_judgement ? <Badge variant="warning">judgement</Badge> : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">No steps recorded yet. Edit the process to add them.</p>
              )}
            </CardContent>
          </Card>
          <ProcessEditor
            startOpen={edit === "1"}
            id={id}
            departments={departments ?? []}
            systemOptions={systemOptions}
            roleOptions={roleOptions}
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
          {p.proposed_automation ? (
            <Card className="border-highlight/30">
              <CardHeader>
                <CardTitle>What an agent would do</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{p.proposed_automation}</p>
              </CardContent>
            </Card>
          ) : null}
          {((p.evidence as Array<{ source: string; detail: string }> | null) ?? []).length ? (
            <Card>
              <CardHeader>
                <CardTitle>Found in your systems</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {(p.evidence as Array<{ source: string; detail: string }>).map((e, i) => (
                    <li key={i}>
                      <span className="font-medium">{e.source}:</span> <span className="text-muted-foreground">{e.detail}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          {opportunities?.length || agents?.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Automation ideas and agents</CardTitle>
              </CardHeader>
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
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Systems used</div>
                <div className="flex flex-wrap gap-1">
                  {systems.length ? (
                    systems.map((s) => (
                      <Badge variant="secondary" key={s}>
                        {s}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Roles involved</div>
                <div className="flex flex-wrap gap-1">
                  {roles.length ? (
                    roles.map((r) => (
                      <Badge variant="secondary" key={r}>
                        {r}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </div>
              </div>
              {p.exceptions.length ? (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Exceptions</div>
                  <ul className="list-inside list-disc text-muted-foreground">
                    {p.exceptions.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {policies.length ? (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Policies used by agents</div>
                  <ul className="list-inside list-disc text-muted-foreground">
                    {policies.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Source</div>
                <div>
                  {SOURCE_LABEL[p.discovery_source]}
                  {(p.documents as unknown as { title: string } | null)?.title ? <span className="text-muted-foreground"> · {(p.documents as unknown as { title: string }).title}</span> : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function uniqueOptions(options: Array<{ value: string; hint: string }>) {
  const seen = new Set<string>();
  return options
    .filter((o) => {
      const k = o.value.trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 12);
}
