import { isMockMode, modelIdFor } from "@autonomos/ai";
import { triggerConfigured } from "@autonomos/workflows";
import { ActionButton } from "@/components/action-button";
import { dateTime, num, usd } from "@/lib/format";
import { adminDb, isAdmin, requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { archiveDepartmentAction, removeMemberAction, setApprovalAction, setPausedAction } from "./actions";
import { CompanyForm, DepartmentForm, InviteForm } from "./forms";
import { DefinitionList } from "@/components/app/definition-list";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    supabase
      .from("audit_events")
      .select("id, occurred_at, actor_type, action, tool, result, users:actor_user_id(email)")
      .eq("organization_id", session.org.id)
      .order("occurred_at", { ascending: false })
      .limit(50),
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
        <Card className={session.org.agentsPaused ? "border-warning" : undefined}>
          <CardHeader>
            <CardTitle>Emergency stop</CardTitle>
            <CardDescription>Immediately stops all agents from taking new actions. Runs in progress stop before their next external action.</CardDescription>
          </CardHeader>
          <CardContent>
            {admin ? (
              session.org.agentsPaused ? (
                <ActionButton action={setPausedAction.bind(null, false)}>Resume all agents</ActionButton>
              ) : (
                <ActionButton variant="destructive" confirm="Pause every agent in the organisation now?" confirmLabel="Pause all agents" action={setPausedAction.bind(null, true)}>
                  Pause all agents
                </ActionButton>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Only admins can pause all agents.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Company</CardTitle>
          </CardHeader>
          <CardContent>
            <CompanyForm org={session.org} disabled={!admin} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Departments</CardTitle>
            <CardDescription>Hourly cost per department overrides the company default for estimated value.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(departments ?? []).map((d) => (
              <DepartmentForm
                key={d.id}
                dept={{ ...d, hourly_labour_cost: d.hourly_labour_cost === null ? null : Number(d.hourly_labour_cost) }}
                disabled={!admin}
                extra={
                  admin ? (
                    <ActionButton size="sm" variant="ghost" confirm={`Archive ${d.name}?`} confirmLabel="Archive" action={archiveDepartmentAction.bind(null, d.id)}>
                      Archive
                    </ActionButton>
                  ) : null
                }
              />
            ))}
            <div className="border-t border-border pt-3">
              <DepartmentForm disabled={!admin} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <ul>
            {(members ?? []).map((m) => {
              const u = m.users as unknown as { first_name: string; last_name: string; email: string } | null;
              return (
                <li key={m.user_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 text-sm sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{u ? `${u.first_name} ${u.last_name}` : "–"}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {u?.email} · <span className="capitalize">{m.role}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {admin ? (
                      <ActionButton size="sm" variant="ghost" action={setApprovalAction.bind(null, m.user_id, !m.can_approve)}>
                        {m.can_approve ? "Can approve" : "Cannot approve"}
                      </ActionButton>
                    ) : (
                      <span className="text-xs text-muted-foreground">{m.can_approve ? "Can approve" : "Cannot approve"}</span>
                    )}
                    {admin && m.role !== "owner" && m.user_id !== session.user.id ? (
                      <ActionButton size="sm" variant="ghost" confirm="Remove this member?" confirmLabel="Remove" action={removeMemberAction.bind(null, m.user_id)}>
                        Remove
                      </ActionButton>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {(invites ?? []).map((i) => (
              <li key={i.email} className="border-b border-border px-4 py-3 text-sm text-muted-foreground sm:px-5">
                <div className="truncate">{i.email}</div>
                <div className="text-xs">
                  Invited · <span className="capitalize">{i.role}</span>
                </div>
              </li>
            ))}
          </ul>
          <CardContent>
            <InviteForm disabled={!admin} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI</CardTitle>
            <CardDescription>Models are selected by class. Change them with environment variables.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(["FAST_MODEL", "SMART_MODEL", "AGENT_MODEL"] as const).map((c) => (
              <div key={c} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="w-16 capitalize text-muted-foreground">{c.replace("_MODEL", "").toLowerCase()}</span>
                <code className="break-all rounded bg-muted px-2 py-0.5 text-xs">{modelIdFor(c)}</code>
                {isMockMode(c) ? <Badge variant="warning">mock mode, no API key</Badge> : null}
              </div>
            ))}
            {!triggerConfigured() ? (
              <Alert variant="warning">
                <AlertDescription>Trigger.dev is not configured, so agents cannot run. Set TRIGGER_SECRET_KEY.</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Billing and usage</CardTitle>
            <CardDescription>Design partners are billed manually. Usage this month:</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audit log</CardTitle>
            <CardDescription>Append-only record of material actions by people and agents. Latest 50.</CardDescription>
          </CardHeader>
          <ul className="text-sm">
            {(auditRows ?? []).map((a) => (
              <li key={a.id} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-0 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="break-words font-mono text-xs">
                    {a.action}
                    {a.tool ? <span className="text-muted-foreground"> · {a.tool}</span> : null}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {dateTime(a.occurred_at)} · {a.actor_type === "user" ? ((a.users as unknown as { email: string } | null)?.email ?? "user") : a.actor_type}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{a.result}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
