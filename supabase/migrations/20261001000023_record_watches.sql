-- Agents that start on each new record in a connected system (trigger type "new_record").
-- A watch remembers which system it watches and when it last looked; the seen list holds
-- every record a watch has already handled, so no record ever starts two runs. Records that
-- existed when the watch began are marked seen without running.
create table public.agent_record_watches (
  agent_id uuid primary key references public.agents (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  integration text not null,
  started_at timestamptz not null default now(),
  checked_at timestamptz,
  last_error text
);
alter table public.agent_record_watches enable row level security;
create policy agent_record_watches_member_select on public.agent_record_watches for select using (public.is_org_member(organization_id));

create table public.agent_seen_records (
  agent_id uuid not null references public.agents (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  record_id text not null,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  seen_at timestamptz not null default now(),
  primary key (agent_id, record_id)
);
alter table public.agent_seen_records enable row level security;
create policy agent_seen_records_member_select on public.agent_seen_records for select using (public.is_org_member(organization_id));
