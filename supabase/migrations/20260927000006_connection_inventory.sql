-- What a connected system holds, taken once when it is connected: projects, datasets and
-- table schemas, ad accounts, labels, calendars, pipelines, and which read actions work.
-- Metadata only, never records. Scans and discovery reuse it instead of looking it up again.
alter table public.integration_connections
  add column inventory jsonb,
  add column inventory_status text check (inventory_status in ('running', 'ready', 'failed')),
  add column inventoried_at timestamptz,
  add column inventory_error text;
