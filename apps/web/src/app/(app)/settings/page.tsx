import { isMockMode, modelIdFor } from "@autonomos/ai";
import { triggerConfigured } from "@autonomos/workflows";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, CardBody, CardHeader, DefinitionList, Notice, PageHeader } from "@/components/ui";
import { dateTime, num, usd } from "@/lib/format";
import { adminDb, isAdmin, requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { archiveDepartmentAction, removeMemberAction, setApprovalAction, setPausedAction } from "./actions";
import { CompanyForm, DepartmentForm, InviteForm } from "./forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireSession();
  const admin = isAdmin(session);
  const supabase = await createClient();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [{ data: departments }, { data: members }, { data: invites }, { data: auditRows }, { count: runs }, { count: toolActions }, { data: usage }, { count: activeAgents }] = await Promise.all([
    supabase.from("departments").select("id, name, hourly_labour_cost").eq("organization_id", session.org.id).is("archived_at", null).order("name"),
    supabase.from("organization_members").select("user_id, role, can_approve, users(first_name, last_name, email)").eq("organization_id", session.org.id),
    supabase.from("organization_invites").select("email, role, created_at").eq("organization_id", session.org.id).is("accepted_at", null),
    supabase.from("audit_events").select("id, occurred_at, actor_type, action, tool, result, users:actor_user_id(email)").eq("organization_id", session.org.id).order("occurred_at", { ascending: false }).limit(50),
    supabase.from("agent_runs").select("id", { count: "exact", head: true }).eq("organization_id", session.org.id).gte("queued_at", monthStart),
    supabase.from("agent_actions").select("id", { count: "exact", head: true }).eq("organization_id", session.org.id).gte("created_at", monthStart),
    supabase.from("model_usage").select("input_tokens, output_tokens, estimated_cost").eq("organization_id", session.org.id).gte("created_at", monthStart),
    supabase.from("agents").select("id", { count: "exact", head: true }).eq("organization_id", session.org.id).eq("status", "active"),
  ]);
  const { data: org } = await adminDb().from("organizations").select("plan, subscription_status").eq("id", session.org.id).single();
  const tokens = (usage ?? []).reduce((s, u) => s + u.input_tokens + u.output_tokens, 0);
  const cost = (usage ?? []).reduce((s, u) => s + Number(u.estimated_cost), 0);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <Card className={session.org.agentsPaused ? "border-warn" : undefined}>
          <CardHeader title="Emergency stop" description="Immediately stops all agents from taking new actions. Runs in progress stop before their next external action." />
          <CardBody>
            {admin ? (
              session.org.agentsPaused ? (
                <ActionButton action={setPausedAction.bind(null, false)}>Resume all agents</ActionButton>
              ) : (
                <ActionButton variant="danger" confirm="Pause every agent in the organisation now?" action={setPausedAction.bind(null, true)}>
                  Pause all agents
                </ActionButton>
              )
            ) : (
              <p className="text-sm text-muted">Only admins can pause all agents.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Company" />
          <CardBody>
            <CompanyForm org={session.org} disabled={!admin} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Departments" description="Hourly cost per department overrides the company default for estimated value." />
          <CardBody className="space-y-3">
            {(departments ?? []).map((d) => (
              <DepartmentForm
                key={d.id}
                dept={{ ...d, hourly_labour_cost: d.hourly_labour_cost === null ? null : Number(d.hourly_labour_cost) }}
                disabled={!admin}
                extra={
                  admin ? (
                    <ActionButton size="sm" variant="ghost" confirm={`Archive ${d.name}?`} action={archiveDepartmentAction.bind(null, d.id)}>
                      Archive
                    </ActionButton>
                  ) : null
                }
              />
            ))}
            <div className="border-t border-border pt-3">
              <DepartmentForm disabled={!admin} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Members" />
          <ul>
            {(members ?? []).map((m) => {
              const u = m.users as unknown as { first_name: string; last_name: string; email: string } | null;
              return (
                <li key={m.user_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 text-sm sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{u ? `${u.first_name} ${u.last_name}` : "–"}</div>
                    <div className="truncate text-xs text-muted">
                      {u?.email} · <span className="capitalize">{m.role}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {admin ? (
                      <ActionButton size="sm" variant="ghost" action={setApprovalAction.bind(null, m.user_id, !m.can_approve)}>
                        {m.can_approve ? "Can approve" : "Cannot approve"}
                      </ActionButton>
                    ) : (
                      <span className="text-xs text-muted">{m.can_approve ? "Can approve" : "Cannot approve"}</span>
                    )}
                    {admin && m.role !== "owner" && m.user_id !== session.user.id ? (
                      <ActionButton size="sm" variant="ghost" confirm="Remove this member?" action={removeMemberAction.bind(null, m.user_id)}>
                        Remove
                      </ActionButton>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {(invites ?? []).map((i) => (
              <li key={i.email} className="border-b border-border px-4 py-3 text-sm text-muted sm:px-5">
                <div className="truncate">{i.email}</div>
                <div className="text-xs">
                  Invited · <span className="capitalize">{i.role}</span>
                </div>
              </li>
            ))}
          </ul>
          <CardBody>
            <InviteForm disabled={!admin} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="AI" description="Models are selected by class. Change them with environment variables." />
          <CardBody className="space-y-2 text-sm">
            {(["FAST_MODEL", "SMART_MODEL", "AGENT_MODEL"] as const).map((c) => (
              <div key={c} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="w-16 capitalize text-muted">{c.replace("_MODEL", "").toLowerCase()}</span>
                <code className="break-all rounded bg-surface-muted px-2 py-0.5 text-xs">{modelIdFor(c)}</code>
                {isMockMode(c) ? <Badge tone="warn">mock mode, no API key</Badge> : null}
              </div>
            ))}
            {!triggerConfigured() ? <Notice tone="warn">Trigger.dev is not configured, so agents cannot run. Set TRIGGER_SECRET_KEY.</Notice> : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Billing and usage" description="Design partners are billed manually. Usage this month:" />
          <CardBody>
            <DefinitionList
              className="lg:grid-cols-6"
              items={[
                { label: "Plan", value: <span className="capitalize">{org?.plan.replaceAll("_", " ")}</span> },
                { label: "Agent runs", value: num(runs ?? 0) },
                { label: "Tool actions", value: num(toolActions ?? 0) },
                { label: "Model tokens", value: num(tokens) },
                { label: "Execution cost", value: usd(cost) },
                { label: "Active agents", value: num(activeAgents ?? 0) },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Audit log" description="Append-only record of material actions by people and agents. Latest 50." />
          <ul className="text-sm">
            {(auditRows ?? []).map((a) => (
              <li key={a.id} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-0 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="break-all font-mono text-xs">
                    {a.action}
                    {a.tool ? <span className="text-muted"> · {a.tool}</span> : null}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">
                    {dateTime(a.occurred_at)} · {a.actor_type === "user" ? ((a.users as unknown as { email: string } | null)?.email ?? "user") : a.actor_type}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted">{a.result}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
