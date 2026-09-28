-- Ready-made playbooks: templates the site's administrators create (with AI) for a tool, and
-- every workspace can start from. A playbook is global, not owned by a workspace: a process
-- (trigger and steps) plus the agent that runs it (instructions, tools, autonomy level). The
-- definitions of its Composio tools are stored with it, like an agent version's.
create table public.playbooks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text not null default '',
  department text not null default 'Operations',
  toolkits text[] not null default '{}',
  trigger text,
  steps jsonb not null default '[]',
  agent jsonb not null default '{}',
  tool_snapshots jsonb not null default '[]',
  estimated_minutes_per_occurrence numeric(8, 2),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index playbooks_status_idx on public.playbooks (status);

-- Signed-in people read published playbooks; only the server (service role) writes, after it
-- has checked the person is a site administrator.
alter table public.playbooks enable row level security;
create policy playbooks_read on public.playbooks for select to authenticated using (status = 'published');

-- An automation idea started from a playbook builds the playbook's agent as written.
alter table public.automation_opportunities add column playbook_id uuid references public.playbooks (id) on delete set null;
