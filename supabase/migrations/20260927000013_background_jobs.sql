-- Work that takes more than a moment (reading a website, importing a document, finding
-- automation ideas, building an agent, creating the sample workspace) runs as a job on the
-- server. The page only follows it, so closing the browser or reloading never stops it.
-- A running job beats heartbeat_at; one that stops beating was cut off and is run again.
create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null,
  subject text,
  input jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  result jsonb,
  error text,
  attempts int not null default 0,
  heartbeat_at timestamptz,
  last_polled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index background_jobs_org_idx on public.background_jobs (organization_id, kind, subject, created_at desc);
create index background_jobs_user_idx on public.background_jobs (user_id, kind, created_at desc);
create index background_jobs_active_idx on public.background_jobs (status, heartbeat_at) where status in ('queued', 'running');
-- Server only: read and written with the service role after the caller is checked.
alter table public.background_jobs enable row level security;
revoke all on table public.background_jobs from anon, authenticated;
