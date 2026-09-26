-- Processes a workspace said it does not run. Discovery never proposes them (or close
-- variants) again. Removing a row lets AutonomOS suggest that process again.
create table public.rejected_processes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  department text,
  rejected_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, title)
);
alter table public.rejected_processes enable row level security;
create policy rejected_processes_member_select on public.rejected_processes for select using (public.is_org_member(organization_id));

-- Titles rejected during a run, so the review can show and undo them.
alter table public.discovery_runs add column rejected jsonb not null default '[]';
