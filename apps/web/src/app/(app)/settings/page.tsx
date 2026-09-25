import { isMockMode, modelIdFor } from "@autonomos/ai";
import { triggerConfigured } from "@autonomos/workflows";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, CardBody, CardHeader, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
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
              <div key={d.id} className="flex flex-wrap items-center gap-2">
                <DepartmentForm dept={{ ...d, hourly_labour_cost: d.hourly_labour_cost === null ? null : Number(d.hourly_labour_cost) }} disabled={!admin} />
                {admin ? (
                  <ActionButton size="sm" variant="ghost" confirm={`Archive ${d.name}?`} action={archiveDepartmentAction.bind(null, d.id)}>
                    Archive
                  </ActionButton>
                ) : null}
              </div>
            ))}
            <div className="border-t border-border pt-3">
              <DepartmentForm disabled={!admin} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Members" />
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Can approve</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m) => {
                const u = m.users as unknown as { first_name: string; last_name: string; email: string } | null;
                return (
                  <tr key={m.user_id}>
                    <Td>{u ? `${u.first_name} ${u.last_name}` : "–"}</Td>
                    <Td className="text-muted">{u?.email}</Td>
                    <Td className="capitalize">{m.role}</Td>
                    <Td>
                      {admin ? (
                        <ActionButton size="sm" variant="ghost" action={setApprovalAction.bind(null, m.user_id, !m.can_approve)}>
                          {m.can_approve ? "Yes" : "No"}
                        </ActionButton>
                      ) : m.can_approve ? (
                        "Yes"
                      ) : (
                        "No"
                      )}
                    </Td>
                    <Td>
                      {admin && m.role !== "owner" && m.user_id !== session.user.id ? (
                        <ActionButton size="sm" variant="ghost" confirm="Remove this member?" action={removeMemberAction.bind(null, m.user_id)}>
                          Remove
                        </ActionButton>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
              {(invites ?? []).map((i) => (
                <tr key={i.email}>
                  <Td className="text-muted">Invited</Td>
                  <Td className="text-muted">{i.email}</Td>
                  <Td className="capitalize text-muted">{i.role}</Td>
                  <Td />
                  <Td />
                </tr>
              ))}
            </tbody>
          </Table>
          <CardBody>
            <InviteForm disabled={!admin} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="AI" description="Models are selected by class. Change them with environment variables." />
          <CardBody className="space-y-2 text-sm">
            {(["FAST_MODEL", "SMART_MODEL", "AGENT_MODEL"] as const).map((c) => (
              <div key={c} className="flex items-center gap-3">
                <span className="w-32 text-muted">{c.replace("_MODEL", "").toLowerCase()}</span>
                <code className="rounded bg-surface-muted px-2 py-0.5 text-xs">{modelIdFor(c)}</code>
                {isMockMode(c) ? <Badge tone="warn">mock mode, no API key</Badge> : null}
              </div>
            ))}
            {!triggerConfigured() ? <Notice tone="warn">Trigger.dev is not configured, so agents cannot run. Set TRIGGER_SECRET_KEY.</Notice> : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Billing and usage" description="Design partners are billed manually. Usage this month:" />
          <CardBody className="grid gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <div className="text-xs text-muted">Plan</div>
              <div className="capitalize">{org?.plan.replaceAll("_", " ")}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Agent runs</div>
              <div>{num(runs ?? 0)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Tool actions</div>
              <div>{num(toolActions ?? 0)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Model tokens</div>
              <div>{num(tokens)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Execution cost</div>
              <div>{usd(cost)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Active agents</div>
              <div>{num(activeAgents ?? 0)}</div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Audit log" description="Append-only record of material actions by people and agents. Latest 50." />
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Action</Th>
                <Th>Tool</Th>
                <Th>Result</Th>
              </tr>
            </thead>
            <tbody>
              {(auditRows ?? []).map((a) => (
                <tr key={a.id}>
                  <Td className="whitespace-nowrap text-muted">{dateTime(a.occurred_at)}</Td>
                  <Td>{a.actor_type === "user" ? ((a.users as unknown as { email: string } | null)?.email ?? "user") : a.actor_type}</Td>
                  <Td className="font-mono text-xs">{a.action}</Td>
                  <Td className="font-mono text-xs text-muted">{a.tool ?? ""}</Td>
                  <Td>{a.result}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
