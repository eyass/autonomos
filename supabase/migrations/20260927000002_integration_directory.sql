-- Any Composio toolkit can be connected. The catalogue keeps the curated systems and gains
-- a row for each directory toolkit the first time an organisation connects it.
alter table public.integrations add column logo text;
alter table public.integrations add column composio_toolkit text;
alter table public.integrations add column source text not null default 'curated' check (source in ('curated', 'directory'));

update public.integrations set composio_toolkit = case key when 'google_drive' then 'googledrive' else key end;
update public.integrations set logo = 'https://logos.composio.dev/api/' || composio_toolkit;
