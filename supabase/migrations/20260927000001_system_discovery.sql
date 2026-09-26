-- Discovery from connected systems: each run reads recent data from every connected system
-- and proposes processes with evidence. Only redacted samples are kept, and only until the
-- proposals are made; afterwards a run keeps per-system counts and the proposals.
create table public.discovery_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references public.users (id),
  status text not null default 'scanning' check (status in ('scanning', 'proposing', 'ready', 'failed')),
  systems jsonb not null default '[]',
  samples jsonb,
  summary text,
  proposals jsonb not null default '[]',
  accepted jsonb not null default '[]',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index discovery_runs_org_idx on public.discovery_runs (organization_id, created_at desc);
alter table public.discovery_runs enable row level security;
create policy discovery_runs_member_select on public.discovery_runs for select using (public.is_org_member(organization_id));

-- Why a process was proposed: what discovery saw in which system.
alter table public.processes add column evidence jsonb not null default '[]';
