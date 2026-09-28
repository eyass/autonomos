import { computeOrgMetrics } from "@autonomos/db";
import Link from "next/link";
import { ButtonLink } from "@/components/app/button-link";
import { cn } from "@/lib/utils";
import { ActionButton } from "@/components/action-button";
import { JobButton } from "@/components/app/job";
import { latestJob } from "@/server/jobs";
import { dateTime, num, aiMoney, money } from "@/lib/format";
import { adminDb, isAdmin, requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { archiveDepartmentAction, removeMemberAction, revokeApiKeyAction, revokeInviteAction, setApprovalAction, setMemberRoleAction } from "./actions";
import { ApiKeyForm, ApprovalLimitForm, CompanyForm, DepartmentForm, InviteForm, PauseControl, ProfileForm } from "./forms";
import { DefinitionList } from "@/components/app/definition-list";
import { PageHeader } from "@/components/app/page-header";
import { ReadinessChecklist } from "@/components/app/readiness-checklist";
import { SettingsSection } from "@/components/app/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { agentStates, executionReadiness } from "@/server/readiness";
import { listApiKeys, planUsage } from "@/server/platform";
import { PLANS } from "@autonomos/schemas";
import { CONTACT_EMAIL } from "@/components/marketing/config";
import { Progress } from "@/components/ui/progress";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireSession();
  const profileJob = await latestJob({ userId: session.user.id, organizationId: session.org.id, kind: "profile_refresh" });
  const admin = isAdmin(session);
  const supabase = await createClient();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [{ data: departments }, { data: members }, { data: invites }, { data: auditRows }, { count: runs }, { count: toolActions }, { data: usage }] = await Promise.all([
    supabase.from("departments").select("id, name, hourly_labour_cost").eq("organization_id", session.org.id).is("archived_at", null).order("name"),
    supabase.from("organization_members").select("user_id, role, can_approve, approval_limit, notification_preferences, users(first_name, last_name, email)").eq("organization_id", session.org.id),
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
  ]);
  const { data: org } = await adminDb().from("organizations").select("plan, subscription_status").eq("id", session.org.id).single();
  const [readiness, agents] = await Promise.all([executionReadiness(session), agentStates(session)]);
  const eligible = agents.filter((a) => a.state.canActivate).length;
  const live = agents.filter((a) => a.status === "active").length;
  const [{ data: connections }, { data: catalog }] = await Promise.all([
    supabase.from("integration_connections").select("integration_key, provider, account_label").eq("organization_id", session.org.id).eq("status", "connected"),
    supabase.from("integrations").select("key, name"),
  ]);
  const [apiKeys, usageVsPlan, { data: invoices }] = await Promise.all([
    admin ? listApiKeys(session) : Promise.resolve([]),
    planUsage(session),
    supabase
      .from("invoices")
      .select("id, number, period_start, period_end, amount, currency, status, issued_at, url")
      .eq("organization_id", session.org.id)
      .order("issued_at", { ascending: false })
      .limit(24),
  ]);
  const { plan } = usageVsPlan;
  const systemName = (key: string) => catalog?.find((c) => c.key === key)?.name ?? key;
  const me = (members ?? []).find((m) => m.user_id === session.user.id);
  const meUser = me?.users as unknown as { first_name: string; last_name: string } | null;
  const prefs = { approvals: true, failures: true, weekly_summary: false, ...((me?.notification_preferences as Record<string, boolean> | null) ?? {}) };
  const tokens = (usage ?? []).reduce((s, u) => s + u.input_tokens + u.output_tokens, 0);
  // AI spend comes from the same ledger and code as the Overview, so the two always agree.
  const spend = await computeOrgMetrics(adminDb(), session.org.id);
  const cost = spend.aiCost;

  const sections = [
    ["stop", "Emergency stop"],
    ["execution", "Execution"],
    ["environment", "Environment"],
    ["profile", "Your profile"],
    ["company", "Company"],
    ["departments", "Departments"],
    ["members", "Members"],
    ...(admin ? ([["developers", "Developers"]] as const) : []),
    ["billing", "Billing"],
    ["audit", "Audit log"],
    ["danger", "Danger zone"],
  ] as const;

  return (
    <>
      <PageHeader title="Settings" />
      <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-8">
        {/* A sticky list of sections beside the page on wide screens; a scrollable row on small ones. */}
        <nav
          aria-label="Settings sections"
          className="sticky top-14 z-10 -mx-4 mb-4 overflow-x-auto bg-background/95 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0 lg:top-18 lg:mb-0 lg:self-start lg:overflow-visible lg:bg-transparent lg:py-0 lg:backdrop-blur-none"
        >
          <ul className="flex gap-2 pb-1 lg:flex-col lg:gap-0.5">
            {sections.map(([id, label]) => (
              <li key={id} className="shrink-0">
                <Button asChild size="sm" variant="outline" className={cn("rounded-full lg:w-full lg:justify-start lg:rounded-md lg:border-0 lg:shadow-none", id === "danger" && "text-destructive")}>
                  <Link href={`#${id}`}>{label}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-4 md:space-y-6">
          <SettingsSection
            id="stop"
            title="Emergency stop"
            description="Stops all agents from taking new actions. Runs in progress stop before their next external action."
            tone={session.org.agentsPaused ? "warning" : undefined}
            defaultOpen={session.org.agentsPaused}
          >
            {admin ? <PauseControl paused={session.org.agentsPaused} until={session.org.agentsPausedUntil} /> : <p className="text-sm text-muted-foreground">Only admins can pause all agents.</p>}
          </SettingsSection>

          <SettingsSection
            id="execution"
            title="Execution"
            description={
              readiness.ready
                ? agents.length
                  ? `The workspace is set up, so agents can be tested. ${live} live, ${eligible} ready to go live, ${agents.length - live - eligible} blocked; each agent's own checks are below.`
                  : "The workspace is set up, so agents can be tested. Each agent goes live only once its own checks pass."
                : "Not ready yet. Fix the items below before agents can run."
            }
            action={<Badge variant={readiness.ready ? "success" : "warning"}>{readiness.ready ? "Ready to test" : "Not ready"}</Badge>}
            defaultOpen={!readiness.ready}
          >
            <ReadinessChecklist checks={readiness.checks} />
            {agents.length ? (
              <div className="mt-4 border-t border-border pt-4" data-testid="agent-readiness">
                <h3 className="text-sm font-medium">Each agent</h3>
                <ul className="mt-2 divide-y divide-border text-sm">
                  {agents.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
                      <div className="min-w-0 flex-1">
                        <Link href={`/agents/${a.id}${a.firstBlocker ? "#readiness" : ""}`} className="font-medium hover:underline">
                          {a.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{a.firstBlocker ? `${a.firstBlocker.label}: ${a.firstBlocker.detail}` : a.state.description}</p>
                      </div>
                      <Badge variant={a.status === "active" ? (a.firstBlocker ? "warning" : "success") : a.state.canActivate ? "success" : "secondary"}>{a.state.title}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </SettingsSection>

          <SettingsSection
            id="environment"
            title="Environment"
            description="Where agents act. Sandbox systems hold sample data inside AutonomOS, so nothing real changes. Live systems are your real accounts."
          >
            {connections?.length ? (
              <ul className="-mx-6 border-t border-border text-sm">
                {connections.map((c) => (
                  <li key={c.integration_key} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-6 py-2.5 last:border-0">
                    <span className="min-w-0 flex-1 truncate font-medium">{systemName(c.integration_key)}</span>
                    {c.account_label ? <span className="truncate text-xs text-muted-foreground">{c.account_label}</span> : null}
                    <Badge variant={c.provider === "sandbox" ? "warning" : "success"}>{c.provider === "sandbox" ? "Sandbox" : "Live"}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No systems connected yet.</p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              To move a system from sandbox to live, disconnect it and connect your real account in{" "}
              <Link href="/integrations" className="underline">
                Integrations
              </Link>
              . Test runs are always simulated, whichever mode a system is in.
            </p>
          </SettingsSection>

          <SettingsSection id="profile" title="Your profile" description="Your name and which emails you get.">
            <ProfileForm firstName={meUser?.first_name ?? ""} lastName={meUser?.last_name ?? ""} prefs={prefs} />
          </SettingsSection>

          <SettingsSection
            id="company"
            title="Workspace and company"
            description={
              session.org.websiteProfile
                ? `Profile drafted from ${session.org.website ?? "your website"}${session.org.detectedTools.length ? `. Tools found: ${session.org.detectedTools.join(", ")}` : ""}.`
                : "Add your website to let AutonomOS keep this profile up to date."
            }
            action={
              admin && session.org.website ? (
                <JobButton size="sm" variant="outline" kind="profile_refresh" initialJob={profileJob} pendingLabel="Reading website…">
                  Refresh from website
                </JobButton>
              ) : null
            }
          >
            <CompanyForm org={session.org} disabled={!admin} />
          </SettingsSection>

          <SettingsSection id="departments" title="Departments" description="Hourly cost per department overrides the company default for estimated value.">
            <div className="space-y-3">
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
            </div>
          </SettingsSection>

          <SettingsSection id="members" title="Members" description="Who can use AutonomOS, their role, and who can approve agent actions.">
            <ul className="-mx-6 border-t border-border">
              {(members ?? []).map((m) => {
                const u = m.users as unknown as { first_name: string; last_name: string; email: string } | null;
                const editable = admin && m.role !== "owner" && m.user_id !== session.user.id;
                return (
                  <li key={m.user_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-6 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {u ? `${u.first_name} ${u.last_name}` : "–"}
                        {m.user_id === session.user.id ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{u?.email}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="outline" className="capitalize">
                        {m.role}
                      </Badge>
                      <Badge variant={m.can_approve ? "success" : "secondary"}>
                        {m.can_approve ? (m.approval_limit === null ? "Approver" : `Approves up to ${money(Number(m.approval_limit), session.org.currency)}`) : "No approvals"}
                      </Badge>
                    </div>
                    {admin ? (
                      <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto">
                        <ActionButton size="sm" variant="ghost" action={setApprovalAction.bind(null, m.user_id, !m.can_approve)}>
                          {m.can_approve ? "Remove approval" : "Allow approvals"}
                        </ActionButton>
                        {m.can_approve ? <ApprovalLimitForm userId={m.user_id} limit={m.approval_limit === null ? null : Number(m.approval_limit)} currency={session.org.currency} /> : null}
                        {editable ? (
                          <ActionButton size="sm" variant="ghost" action={setMemberRoleAction.bind(null, m.user_id, m.role === "admin" ? "member" : "admin")}>
                            {m.role === "admin" ? "Make member" : "Make admin"}
                          </ActionButton>
                        ) : null}
                        {editable ? (
                          <ActionButton size="sm" variant="ghost" confirm="Remove this member?" confirmLabel="Remove" action={removeMemberAction.bind(null, m.user_id)}>
                            Remove
                          </ActionButton>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
              {(invites ?? []).map((i) => (
                <li key={i.email} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-6 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{i.email}</div>
                    <div className="text-xs text-muted-foreground">Invited {dateTime(i.created_at)}, not joined yet</div>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {i.role}
                  </Badge>
                  <Badge variant="warning">Pending</Badge>
                  {admin ? (
                    <ActionButton size="sm" variant="ghost" confirm={`Revoke the invite for ${i.email}?`} confirmLabel="Revoke" action={revokeInviteAction.bind(null, i.email)}>
                      Revoke
                    </ActionButton>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="pt-4">
              <InviteForm disabled={!admin} />
            </div>
          </SettingsSection>

          {admin ? (
            <SettingsSection id="developers" title="Developers" description="API keys let other systems use the AutonomOS API. A key acts with the role of the admin who created it.">
              <div className="space-y-4">
                <ApiKeyForm />
                {apiKeys.length ? (
                  <ul className="-mx-6 border-t border-border text-sm">
                    {apiKeys.map((k) => (
                      <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-6 py-2.5 last:border-0">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{k.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            <code>{k.prefix}…</code> · {k.scope === "read" ? "read only" : "read and change"} · created {dateTime(k.created_at)} ·{" "}
                            {k.last_used_at ? `last used ${dateTime(k.last_used_at)}` : "never used"}
                          </div>
                        </div>
                        {k.revoked_at ? (
                          <Badge variant="secondary">Revoked</Badge>
                        ) : (
                          <ActionButton
                            size="sm"
                            variant="ghost"
                            confirm={`Revoke "${k.name}"? Anything using it stops working immediately.`}
                            confirmLabel="Revoke"
                            action={revokeApiKeyAction.bind(null, k.id)}
                          >
                            Revoke
                          </ActionButton>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Send the key as <code>Authorization: Bearer aos_live_…</code>. See the{" "}
                  <Link href="/docs/api" className="underline">
                    API reference
                  </Link>
                  . Webhook signing secrets belong to each connection; view or rotate them in{" "}
                  <Link href="/integrations" className="underline">
                    Integrations
                  </Link>
                  .
                </p>
              </div>
            </SettingsSection>
          ) : null}

          <SettingsSection
            id="billing"
            title="Billing and usage"
            description={`${plan.name} plan${plan.price ? `, ${plan.price} ${session.org.currency} a month` : ", no card needed"}. Usage this month:`}
          >
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span>Live agents</span>
                    <span className="tabular-nums text-muted-foreground">
                      {usageVsPlan.activeAgents} of {plan.activeAgents}
                    </span>
                  </div>
                  <Progress value={Math.min(100, (usageVsPlan.activeAgents / plan.activeAgents) * 100)} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span>Production runs</span>
                    <span className="tabular-nums text-muted-foreground">
                      {num(usageVsPlan.runs)} of {num(plan.runsPerMonth)}
                    </span>
                  </div>
                  <Progress value={Math.min(100, (usageVsPlan.runs / plan.runsPerMonth) * 100)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {plan.overagePerRun === null
                  ? usageVsPlan.capped
                    ? `This month's ${num(plan.runsPerMonth)} production runs are used. Live agents start again on the 1st, or right away on a paid plan. Test runs are always free.`
                    : `The ${plan.name} plan includes ${num(plan.runsPerMonth)} production runs a month; live agents stop when they are used, until the 1st. Test runs are always free.`
                  : usageVsPlan.overageRuns
                    ? `${num(usageVsPlan.overageRuns)} runs over the allowance, billed at ${plan.overagePerRun} ${session.org.currency} each (${usageVsPlan.overageCost.toFixed(2)} ${session.org.currency} so far).`
                    : `Runs above the allowance keep working and are billed at ${plan.overagePerRun} ${session.org.currency} each. Test runs are free. A new agent cannot go live once the live-agent limit is reached.`}
              </p>
              <DefinitionList
                className="lg:grid-cols-4"
                items={[
                  { label: "All runs incl. tests", value: num(runs ?? 0) },
                  { label: "Tool actions", value: num(toolActions ?? 0) },
                  { label: "Model tokens", value: num(tokens) },
                  {
                    label: "AI spend",
                    value: (
                      <span title="Setup is discovery and drafting; tests and live runs are split by run mode">
                        {aiMoney(cost, session.org.currency)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          setup {aiMoney(spend.aiCostBySource.setup, session.org.currency)} · tests {aiMoney(spend.aiCostBySource.test, session.org.currency)} · live{" "}
                          {aiMoney(spend.aiCostBySource.production, session.org.currency)}
                        </span>
                      </span>
                    ),
                  },
                ]}
              />
              <div>
                <div className="mb-2 text-sm font-medium">Plans</div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {Object.entries(PLANS).map(([key, p]) => (
                    <div key={key} className={`rounded-md border p-3 text-xs ${key === (org?.plan ?? "design_partner") ? "border-primary" : "border-border"}`}>
                      <div className="flex items-center justify-between text-sm font-medium">
                        {p.name}
                        {key === (org?.plan ?? "design_partner") ? <Badge variant="success">Current</Badge> : null}
                      </div>
                      <div className="mt-1 text-muted-foreground">{p.price ? `${p.price} ${session.org.currency} / month` : "Free"}</div>
                      <div className="mt-1 text-muted-foreground">
                        {p.activeAgents} live agent{p.activeAgents === 1 ? "" : "s"} · {num(p.runsPerMonth)} runs ·{" "}
                        {p.overagePerRun === null ? "stops at the limit" : `then ${p.overagePerRun} per run`}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  To change plan, email{" "}
                  <a className="underline" href={`mailto:${CONTACT_EMAIL}?subject=Change%20plan`}>
                    {CONTACT_EMAIL}
                  </a>
                  .
                </p>
              </div>
              <div>
                <div className="mb-2 text-sm font-medium">Invoices</div>
                {invoices?.length ? (
                  <ul className="-mx-6 border-t border-border text-sm">
                    {invoices.map((inv) => (
                      <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-6 py-2.5 last:border-0">
                        <span className="min-w-0 flex-1 truncate font-medium">{inv.number}</span>
                        <span className="text-xs text-muted-foreground">
                          {inv.period_start} to {inv.period_end}
                        </span>
                        <span className="tabular-nums">
                          {Number(inv.amount).toFixed(2)} {inv.currency}
                        </span>
                        <Badge variant={inv.status === "paid" ? "success" : inv.status === "open" ? "warning" : "secondary"} className="capitalize">
                          {inv.status}
                        </Badge>
                        {inv.url ? (
                          <a href={inv.url} className="text-xs underline" target="_blank" rel="noreferrer">
                            PDF
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No invoices yet.</p>
                )}
              </div>
            </div>
          </SettingsSection>

          <SettingsSection id="audit" title="Audit log" description="Append-only record of material actions by people and agents. Latest 50.">
            <ul className="-mx-6 border-t border-border text-sm">
              {(auditRows ?? []).map((a) => (
                <li key={a.id} className="flex items-start gap-3 border-b border-border px-6 py-2.5 last:border-0">
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
          </SettingsSection>

          <SettingsSection id="danger" title="Danger zone" tone="danger" description="Actions here cannot be undone.">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-medium">Delete this workspace</div>
                <div className="text-muted-foreground">Rename, delete and add workspaces in one place.</div>
              </div>
              <ButtonLink href="/workspaces" variant="outline">
                Manage workspaces
              </ButtonLink>
            </div>
          </SettingsSection>
        </div>
      </div>
    </>
  );
}
