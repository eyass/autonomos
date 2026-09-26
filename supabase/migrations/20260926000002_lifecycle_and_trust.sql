-- Why an opportunity exists: facts from the process inventory and connected systems.
alter table public.automation_opportunities add column evidence jsonb not null default '[]';

-- Emergency stop can be time-boxed ("paused until"); null means until an admin resumes.
alter table public.organizations add column agents_paused_until timestamptz;

-- Per-member notification preferences (in-app notifications always show; these gate email).
alter table public.organization_members add column notification_preferences jsonb not null default '{"approvals": true, "failures": true, "weekly_summary": false}';
