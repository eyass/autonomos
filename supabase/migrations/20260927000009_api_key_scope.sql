-- What an API key may do: read only, or read and change. Existing keys keep full access.
alter table public.api_keys add column scope text not null default 'read_write' check (scope in ('read', 'read_write'));
