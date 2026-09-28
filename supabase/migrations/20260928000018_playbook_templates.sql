-- Playbooks become tool-neutral templates: each step names the kind of system it needs (a help
-- desk, a payment system) and every workspace connects its own tool to it. The capabilities a
-- playbook needs are kept alongside the steps for listing and filtering.
alter table public.playbooks add column capabilities text[] not null default '{}';
create index playbooks_capabilities_idx on public.playbooks using gin (capabilities);

-- Playbooks written for one specific tool (before templates) are removed; none were published.
delete from public.playbooks where capabilities = '{}';

-- Which of the workspace's tools fills each capability of the playbook an idea was started from.
alter table public.automation_opportunities add column playbook_bindings jsonb;
