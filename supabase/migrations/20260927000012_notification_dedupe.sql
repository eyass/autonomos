-- One notification per event: a retried job or a second worker sending the same one is a
-- no-op. The key names the event (for example "agent_failed:/activity/<run id>").
alter table public.notifications add column dedupe_key text;
create unique index notifications_dedupe_idx on public.notifications (organization_id, dedupe_key) where dedupe_key is not null;
