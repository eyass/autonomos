-- AutonomOS core schema.
-- Every customer-owned table carries organization_id and is protected by row level security.
-- Server-side workers (Trigger.dev) use the service role and must scope every query explicitly.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type member_role as enum ('owner', 'admin', 'member');
create type process_status as enum ('draft', 'reviewed', 'active', 'archived');
create type process_frequency as enum ('ad_hoc', 'daily', 'weekly', 'monthly', 'event_driven');
create type discovery_source as enum ('interview', 'document', 'integration', 'manual');
create type opportunity_status as enum ('suggested', 'reviewing', 'approved', 'building', 'live', 'rejected', 'archived');
create type agent_status as enum ('draft', 'testing', 'active', 'paused', 'error', 'archived');
create type run_status as enum ('queued', 'running', 'waiting_for_approval', 'completed', 'failed', 'cancelled');
create type run_mode as enum ('test', 'production');
create type approval_status as enum ('pending', 'approved', 'rejected', 'modified', 'expired');
create type intervention_type as enum ('approval', 'exception', 'correction', 'manual_completion', 'override', 'information_request');
create type action_status as enum ('pending', 'succeeded', 'failed', 'simulated', 'skipped');
create type connection_status as enum ('connected', 'error', 'disconnected');
create type integration_provider as enum ('sandbox', 'composio');

-- ---------------------------------------------------------------------------
-- Identity and tenancy
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  industry text,
  employee_count text,
  country text,
  description text,
  company_summary text,
  improvement_areas text[] not null default '{}',
  currency text not null default 'EUR',
  default_hourly_cost numeric(10, 2) not null default 45,
  agents_paused boolean not null default false,
  agents_paused_at timestamptz,
  agents_paused_by uuid references public.users (id),
  onboarding_step text not null default 'about',
  onboarding_completed_at timestamptz,
  plan text not null default 'design_partner',
  subscription_status text not null default 'manual',
  billing_customer_id text,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role member_role not null default 'member',
  can_approve boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role member_role not null default 'member',
  invited_by uuid references public.users (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  hourly_labour_cost numeric(10, 2),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

-- ---------------------------------------------------------------------------
-- Integrations. The catalog is global; connections are per organisation.
-- OAuth tokens are never stored here: Composio holds them, we store the
-- connected account reference only.
-- ---------------------------------------------------------------------------

create table public.integrations (
  key text primary key,
  name text not null,
  category text not null,
  description text not null,
  permissions jsonb not null default '[]',
  priority int not null default 99,
  sort_order int not null default 0
);

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  integration_key text not null references public.integrations (key),
  provider integration_provider not null,
  status connection_status not null default 'connected',
  account_label text,
  external_account_id text,
  granted_permissions jsonb not null default '[]',
  connected_by uuid references public.users (id),
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  last_error text,
  unique (organization_id, integration_key)
);

-- Per-connection secrets (webhook signing). No RLS policies: service role only.
create table public.integration_secrets (
  connection_id uuid primary key references public.integration_connections (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  webhook_secret text not null default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

-- Sandbox provider state: fake tickets, customers, payments, refunds and messages
-- so the full workflow can be exercised without third-party accounts.
create table public.sandbox_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  system text not null,
  kind text not null,
  external_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, system, kind, external_id)
);

-- ---------------------------------------------------------------------------
-- Knowledge and discovery
-- ---------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  source text not null default 'upload',
  content text not null,
  search tsvector generated always as (to_tsvector('english', coalesce(title, '') || ' ' || content)) stored,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now()
);
create index documents_search_idx on public.documents using gin (search);

create table public.discovery_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  department_id uuid references public.departments (id) on delete set null,
  method discovery_source not null default 'interview',
  messages jsonb not null default '[]',
  status text not null default 'open',
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Processes
-- ---------------------------------------------------------------------------

create table public.processes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  department_id uuid references public.departments (id) on delete set null,
  title text not null,
  description text not null default '',
  trigger text,
  frequency process_frequency not null default 'ad_hoc',
  estimated_occurrences_per_month numeric(10, 2),
  estimated_minutes_per_occurrence numeric(10, 2),
  current_autonomy_level smallint not null default 1 check (current_autonomy_level between 1 and 5),
  potential_autonomy_level smallint not null default 1 check (potential_autonomy_level between 1 and 5),
  business_value smallint not null default 3 check (business_value between 1 and 5),
  automation_difficulty smallint not null default 3 check (automation_difficulty between 1 and 5),
  risk_level smallint not null default 3 check (risk_level between 1 and 5),
  inputs text[] not null default '{}',
  outputs text[] not null default '{}',
  decision_points text[] not null default '{}',
  exceptions text[] not null default '{}',
  missing_information text[] not null default '{}',
  notes text,
  status process_status not null default 'draft',
  discovery_source discovery_source not null default 'manual',
  discovery_session_id uuid references public.discovery_sessions (id) on delete set null,
  document_id uuid references public.documents (id) on delete set null,
  confidence numeric(4, 3) check (confidence between 0 and 1),
  reviewed_by uuid references public.users (id),
  reviewed_at timestamptz,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index processes_org_idx on public.processes (organization_id, status);

create table public.process_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  process_id uuid not null references public.processes (id) on delete cascade,
  position int not null,
  title text not null,
  description text,
  performed_by text,
  system text,
  action_type text,
  current_automation text,
  requires_judgement boolean not null default false,
  risk smallint check (risk between 1 and 5),
  estimated_duration_minutes numeric(10, 2),
  unique (process_id, position)
);

create table public.process_systems (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  process_id uuid not null references public.processes (id) on delete cascade,
  system text not null,
  primary key (process_id, system)
);

create table public.process_people (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  process_id uuid not null references public.processes (id) on delete cascade,
  role text not null,
  primary key (process_id, role)
);

-- ---------------------------------------------------------------------------
-- Opportunities
-- ---------------------------------------------------------------------------

create table public.automation_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  process_id uuid not null references public.processes (id) on delete cascade,
  department_id uuid references public.departments (id) on delete set null,
  title text not null,
  description text not null default '',
  problem text not null default '',
  proposed_future_state text not null default '',
  future_state_steps jsonb not null default '[]',
  proposed_agent jsonb not null default '{}',
  scope text,
  expected_outcome text,
  current_autonomy_level smallint not null check (current_autonomy_level between 1 and 5),
  target_autonomy_level smallint not null check (target_autonomy_level between 1 and 5),
  business_value_score smallint not null check (business_value_score between 1 and 5),
  automation_difficulty_score smallint not null check (automation_difficulty_score between 1 and 5),
  risk_score smallint not null check (risk_score between 1 and 5),
  opportunity_score numeric(6, 2) not null default 0,
  estimated_hours_saved_monthly numeric(10, 2),
  estimated_cost_saved_monthly numeric(12, 2),
  estimated_build_complexity text,
  required_integrations text[] not null default '{}',
  required_tools text[] not null default '{}',
  required_approvals text[] not null default '{}',
  human_involvement text[] not null default '{}',
  major_risks text[] not null default '{}',
  rationale text,
  recommended_next_step text,
  template_key text,
  status opportunity_status not null default 'suggested',
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Agents
-- ---------------------------------------------------------------------------

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  process_id uuid not null references public.processes (id) on delete restrict,
  opportunity_id uuid references public.automation_opportunities (id) on delete set null,
  name text not null,
  description text not null default '',
  objective text not null,
  autonomy_level smallint not null default 3 check (autonomy_level between 1 and 5),
  status agent_status not null default 'draft',
  active_version_id uuid,
  trigger_schedule_id text,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Agent versions are immutable. A configuration change inserts a new row.
-- The prompt content used in production lives here (prompt versioning, PRD section 86).
create table public.agent_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  version int not null,
  autonomy_level smallint not null check (autonomy_level between 1 and 5),
  instructions jsonb not null,
  trigger_config jsonb not null,
  policy_config jsonb not null,
  success_criteria jsonb not null default '[]',
  model_config jsonb not null default '{}',
  change_note text,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  unique (agent_id, version)
);

alter table public.agents
  add constraint agents_active_version_fk foreign key (active_version_id) references public.agent_versions (id) on delete set null;

-- Explicit tool allowlist per agent version. The run engine only exposes these tools.
create table public.agent_tools (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  agent_version_id uuid not null references public.agent_versions (id) on delete cascade,
  tool_key text not null,
  primary key (agent_version_id, tool_key)
);

-- ---------------------------------------------------------------------------
-- Runs
-- ---------------------------------------------------------------------------

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  agent_version_id uuid not null references public.agent_versions (id),
  process_id uuid not null references public.processes (id),
  mode run_mode not null,
  trigger jsonb not null,
  status run_status not null default 'queued',
  outcome text,
  summary text,
  input jsonb not null default '{}',
  output jsonb,
  state jsonb not null default '{}',
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  model_cost numeric(12, 6) not null default 0,
  execution_cost numeric(12, 6) not null default 0,
  human_minutes numeric(10, 2) not null default 0,
  baseline_minutes numeric(10, 2),
  estimated_minutes_saved numeric(10, 2),
  success boolean,
  error text,
  error_retryable boolean,
  external_job_id text,
  started_by uuid references public.users (id),
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index agent_runs_agent_idx on public.agent_runs (agent_id, queued_at desc);
create index agent_runs_org_idx on public.agent_runs (organization_id, queued_at desc);

create table public.agent_run_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  agent_run_id uuid not null references public.agent_runs (id) on delete cascade,
  sequence int not null,
  type text not null,
  description text not null,
  input jsonb,
  output jsonb,
  tool text,
  model text,
  duration_ms int,
  cost numeric(12, 6) not null default 0,
  status text not null default 'succeeded',
  created_at timestamptz not null default now(),
  unique (agent_run_id, sequence)
);

-- External actions (tool calls). Writes are persisted before execution and keyed by an
-- idempotency key so a retried workflow can never execute the same write twice.
create table public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  agent_run_id uuid not null references public.agent_runs (id) on delete cascade,
  tool text not null,
  access text not null check (access in ('read', 'write')),
  arguments jsonb not null,
  result jsonb,
  status action_status not null default 'pending',
  idempotency_key text not null,
  policy_evaluation jsonb,
  approval_request_id uuid,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (organization_id, idempotency_key)
);
create index agent_actions_daily_idx on public.agent_actions (agent_id, created_at);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  agent_run_id uuid not null references public.agent_runs (id) on delete cascade,
  agent_action_id uuid references public.agent_actions (id) on delete set null,
  action_type text not null,
  tool text not null,
  title text not null,
  description text,
  proposed_action jsonb not null,
  modifiable_fields text[] not null default '{}',
  evidence jsonb not null default '[]',
  policy_checks jsonb not null default '[]',
  reasoning_summary text,
  confidence numeric(4, 3),
  risk smallint check (risk between 1 and 5),
  status approval_status not null default 'pending',
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '72 hours'),
  resolved_at timestamptz,
  resolved_by uuid references public.users (id),
  decision jsonb,
  comment text
);
create index approval_requests_pending_idx on public.approval_requests (organization_id, status, requested_at desc);

alter table public.agent_actions
  add constraint agent_actions_approval_fk foreign key (approval_request_id) references public.approval_requests (id) on delete set null;

create table public.human_interventions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete cascade,
  agent_run_id uuid references public.agent_runs (id) on delete cascade,
  approval_request_id uuid references public.approval_requests (id) on delete set null,
  type intervention_type not null,
  description text not null,
  minutes_spent numeric(10, 2) not null default 0,
  user_id uuid references public.users (id),
  created_at timestamptz not null default now()
);

create table public.agent_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  agent_run_id uuid not null references public.agent_runs (id) on delete cascade,
  verdict text not null check (verdict in ('correct', 'incorrect')),
  expected_outcome text,
  user_id uuid references public.users (id),
  created_at timestamptz not null default now(),
  unique (agent_run_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Activity, notifications, metrics, usage, audit
-- ---------------------------------------------------------------------------

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('user', 'agent', 'system')),
  actor_user_id uuid references public.users (id),
  agent_id uuid references public.agents (id) on delete set null,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  process_id uuid references public.processes (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  action_type text not null,
  status text not null default 'info',
  title text not null,
  detail jsonb not null default '{}'
);
create index activity_events_org_idx on public.activity_events (organization_id, occurred_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references public.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (organization_id, user_id, created_at desc);

create table public.metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  metric text not null,
  period date not null,
  dimension text not null default '',
  value numeric(14, 4) not null,
  computed_at timestamptz not null default now(),
  unique (organization_id, metric, period, dimension)
);

create table public.model_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  purpose text not null,
  model_class text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cached_input_tokens int not null default 0,
  estimated_cost numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index model_usage_org_idx on public.model_usage (organization_id, created_at);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('user', 'agent', 'system')),
  actor_user_id uuid references public.users (id),
  agent_id uuid,
  agent_version_id uuid,
  process_id uuid,
  agent_run_id uuid,
  action text not null,
  system text,
  tool text,
  input jsonb,
  output jsonb,
  approval_status text,
  result text,
  model text
);
create index audit_events_org_idx on public.audit_events (organization_id, occurred_at desc);

-- Audit records are append-only.
create function public.prevent_audit_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_events are append-only';
end;
$$;

create trigger audit_events_no_update before update or delete on public.audit_events
  for each row execute function public.prevent_audit_mutation();

-- Agent versions are immutable once written.
create function public.prevent_version_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'agent_versions are immutable; create a new version instead';
end;
$$;

create trigger agent_versions_no_update before update on public.agent_versions
  for each row execute function public.prevent_version_mutation();

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['users', 'organizations', 'processes', 'automation_opportunities', 'agents', 'discovery_sessions', 'sandbox_records']
  loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auth hook: mirror auth.users into public.users
-- ---------------------------------------------------------------------------

create function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', split_part(coalesce(new.raw_user_meta_data ->> 'full_name', ''), ' ', 1), ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'full_name', ''), '^\S+\s*', ''), ''), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

create function public.is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

create function public.has_org_role(org uuid, roles member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid() and m.role = any (roles)
  );
$$;

-- Organisation creation is atomic: organisation, owner membership, default departments.
create function public.create_organization(
  p_name text,
  p_website text,
  p_industry text,
  p_employee_count text,
  p_country text,
  p_description text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'company name is required';
  end if;

  insert into public.organizations (name, website, industry, employee_count, country, description, created_by)
  values (trim(p_name), nullif(trim(p_website), ''), nullif(p_industry, ''), nullif(p_employee_count, ''), nullif(p_country, ''), nullif(trim(p_description), ''), uid)
  returning id into org_id;

  insert into public.organization_members (organization_id, user_id, role) values (org_id, uid, 'owner');

  insert into public.audit_events (organization_id, actor_type, actor_user_id, action, result)
  values (org_id, 'user', uid, 'organization.created', 'success');

  return org_id;
end;
$$;

revoke all on function public.create_organization(text, text, text, text, text, text) from public;
grant execute on function public.create_organization(text, text, text, text, text, text) to authenticated;

alter table public.users enable row level security;
create policy users_self_select on public.users for select using (
  id = auth.uid()
  or exists (
    select 1 from public.organization_members mine
    join public.organization_members theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid() and theirs.user_id = public.users.id
  )
);
create policy users_self_update on public.users for update using (id = auth.uid());

alter table public.organizations enable row level security;
create policy organizations_member_select on public.organizations for select using (public.is_org_member(id));
create policy organizations_admin_update on public.organizations for update using (public.has_org_role(id, array['owner', 'admin']::member_role[]));

alter table public.organization_members enable row level security;
create policy members_select on public.organization_members for select using (public.is_org_member(organization_id));
create policy members_admin_write on public.organization_members for all
  using (public.has_org_role(organization_id, array['owner', 'admin']::member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::member_role[]));

alter table public.organization_invites enable row level security;
create policy invites_select on public.organization_invites for select using (public.is_org_member(organization_id));
create policy invites_admin_write on public.organization_invites for all
  using (public.has_org_role(organization_id, array['owner', 'admin']::member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::member_role[]));

alter table public.integrations enable row level security;
create policy integrations_catalog_read on public.integrations for select using (auth.role() = 'authenticated');

-- Integration connections: members can see status, only admins connect or disconnect.
alter table public.integration_connections enable row level security;
create policy connections_select on public.integration_connections for select using (public.is_org_member(organization_id));
create policy connections_admin_write on public.integration_connections for all
  using (public.has_org_role(organization_id, array['owner', 'admin']::member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::member_role[]));
alter table public.integration_secrets enable row level security;

-- Audit: members read, members insert, nobody updates or deletes (trigger enforced too).
alter table public.audit_events enable row level security;
create policy audit_select on public.audit_events for select using (public.is_org_member(organization_id));
create policy audit_insert on public.audit_events for insert with check (public.is_org_member(organization_id));

-- Agent versions: insert and read only.
alter table public.agent_versions enable row level security;
create policy versions_select on public.agent_versions for select using (public.is_org_member(organization_id));
create policy versions_insert on public.agent_versions for insert with check (public.is_org_member(organization_id));

-- Runtime records (runs, actions, approvals, interventions, activity) are written only by
-- server code using the service role after it has checked membership and role.
-- Members may read them. This stops a client resolving an approval without the engine.
do $$
declare t text;
begin
  foreach t in array array[
    'agent_runs', 'agent_run_steps', 'agent_actions', 'model_usage', 'metrics',
    'approval_requests', 'human_interventions', 'activity_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I_select on public.%I for select using (public.is_org_member(organization_id))', t, t);
  end loop;
end;
$$;

-- Notifications: a user sees organisation-wide notifications and their own.
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select
  using (public.is_org_member(organization_id) and (user_id is null or user_id = auth.uid()));
create policy notifications_update on public.notifications for update
  using (public.is_org_member(organization_id) and (user_id is null or user_id = auth.uid()));

-- Everything else: full access for organisation members.
do $$
declare t text;
begin
  foreach t in array array[
    'departments', 'sandbox_records', 'documents', 'discovery_sessions', 'processes', 'process_steps',
    'process_systems', 'process_people', 'automation_opportunities', 'agents', 'agent_tools',
    'agent_feedback'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I_member_all on public.%I for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id))',
      t, t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Integration catalog (PRD sections 54, 55, 127)
-- ---------------------------------------------------------------------------

insert into public.integrations (key, name, category, description, permissions, priority, sort_order) values
  ('gmail', 'Gmail', 'Communication', 'Send email and read selected labels.',
    '["Read messages in selected labels", "Send email on your behalf"]', 1, 10),
  ('outlook', 'Outlook', 'Communication', 'Send email and read selected folders.',
    '["Read messages in selected folders", "Send email on your behalf"]', 4, 11),
  ('slack', 'Slack', 'Communication', 'Post updates and reports to channels.',
    '["Read channel metadata", "Post messages to channels"]', 1, 12),
  ('hubspot', 'HubSpot', 'CRM', 'Read contacts, companies and deals.',
    '["Read contacts", "Read deals and pipeline stages", "Update contact properties"]', 3, 20),
  ('salesforce', 'Salesforce', 'CRM', 'Read accounts, contacts and opportunities.',
    '["Read accounts and contacts", "Read opportunities"]', 4, 21),
  ('zendesk', 'Zendesk', 'Support', 'Read tickets, reply to customers and update ticket status.',
    '["Read tickets", "Reply to tickets", "Update ticket status and tags"]', 2, 30),
  ('intercom', 'Intercom', 'Support', 'Read conversations and reply to customers.',
    '["Read conversations", "Reply to conversations"]', 4, 31),
  ('stripe', 'Stripe', 'Payments', 'Look up customers and payments and issue refunds.',
    '["Read customers", "Read payments", "Read refunds", "Create refunds"]', 2, 40),
  ('google_drive', 'Google Drive', 'Knowledge', 'Import SOPs and process documents.',
    '["Read selected documents"]', 1, 50),
  ('notion', 'Notion', 'Knowledge', 'Import pages that describe how work is done.',
    '["Read selected pages"]', 4, 51);
