-- Platform features: API keys, approval limits, sample workspaces, plan limits and invoices.

-- API keys. Only a SHA-256 hash is stored; the key is shown once when created.
-- No RLS policies: read and written by server code after an admin check (service role).
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_keys_org_idx on public.api_keys (organization_id, created_at desc);
alter table public.api_keys enable row level security;

-- Largest amount a member may approve (in the organisation's currency). Null means no limit.
alter table public.organization_members add column approval_limit numeric(12, 2) check (approval_limit is null or approval_limit >= 0);

-- A sample workspace with fictional data and sandbox systems only.
alter table public.organizations add column is_demo boolean not null default false;

-- Invoices issued to the organisation (design partners are invoiced manually).
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  period_start date not null,
  period_end date not null,
  amount numeric(12, 2) not null,
  currency text not null default 'EUR',
  status text not null default 'open' check (status in ('draft', 'open', 'paid', 'void')),
  issued_at timestamptz not null default now(),
  url text,
  unique (organization_id, number)
);
alter table public.invoices enable row level security;
create policy invoices_admin_select on public.invoices for select using (public.has_org_role(organization_id, array['owner', 'admin']::member_role[]));
