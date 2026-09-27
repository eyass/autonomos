-- Runs an agent handed to a person stay on the Approvals page until someone marks them handled.
alter table public.agent_runs
  add column handled_at timestamptz,
  add column handled_by uuid references public.users(id) on delete set null;
