-- Company knowledge: every source a company adds about itself (its whole website, its help
-- centre, files, pasted text), split into passages searchable by meaning and by keyword, and a
-- company brief built up from all of them. See docs/superpowers/specs/2026-10-01-company-knowledge-design.md.

create extension if not exists vector with schema extensions;

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('website', 'help_center', 'url', 'file', 'paste')),
  title text not null,
  url text,
  -- Original upload in the private "knowledge" bucket: <organization_id>/<source_id>/<name>.
  file_path text,
  mime text,
  bytes integer,
  -- Extracted text of a file or pasted text; websites are read by the worker instead.
  content text,
  status text not null default 'queued' check (status in ('queued', 'processing', 'ready', 'failed')),
  error text,
  -- Progress and resume state of a website read (frontier, visited, counts).
  crawl jsonb,
  pages integer not null default 0,
  passages integer not null default 0,
  chars integer not null default 0,
  summary text,
  -- The document this source was made from (Discover, Document), when there is one.
  document_id uuid references public.documents (id) on delete set null,
  added_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index knowledge_sources_org_idx on public.knowledge_sources (organization_id, created_at desc);
create unique index knowledge_sources_site_once on public.knowledge_sources (organization_id, kind, url) where kind in ('website', 'help_center');

create table public.knowledge_passages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_id uuid not null references public.knowledge_sources (id) on delete cascade,
  ordinal integer not null,
  url text,
  heading text,
  content text not null,
  search tsvector generated always as (to_tsvector('simple', coalesce(heading, '') || ' ' || content)) stored,
  embedding extensions.vector(768),
  created_at timestamptz not null default now()
);
create index knowledge_passages_source_idx on public.knowledge_passages (source_id, ordinal);
create index knowledge_passages_search_idx on public.knowledge_passages using gin (search);
create index knowledge_passages_embedding_idx on public.knowledge_passages using hnsw (embedding extensions.vector_cosine_ops);

alter table public.organizations
  add column company_brief jsonb,
  add column company_brief_at timestamptz;
comment on column public.organizations.company_brief is 'What AutonomOS knows about how the company works (CompanyBriefSchema), merged from every knowledge source';

-- Members read; writes go through the server (service role) after role checks.
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_passages enable row level security;
create policy knowledge_sources_member_select on public.knowledge_sources for select using (public.is_org_member(organization_id));
create policy knowledge_passages_member_select on public.knowledge_passages for select using (public.is_org_member(organization_id));

-- Hybrid search: the nearest passages by meaning and the best keyword matches, combined by
-- reciprocal rank fusion. Runs with the caller's rights, so row level security applies.
create or replace function public.match_knowledge(org uuid, query_embedding extensions.vector(768), query_text text, match_count integer default 6)
returns table (id uuid, source_id uuid, heading text, content text, url text, score double precision)
language sql
stable
set search_path = public, extensions
as $$
  with by_meaning as (
    select p.id, row_number() over (order by p.embedding <=> query_embedding) as rank
    from knowledge_passages p
    where p.organization_id = org and p.embedding is not null
    order by p.embedding <=> query_embedding
    limit 30
  ),
  by_words as (
    select p.id, row_number() over (order by ts_rank(p.search, q) desc) as rank
    from knowledge_passages p, websearch_to_tsquery('simple', query_text) q
    where p.organization_id = org and p.search @@ q
    order by ts_rank(p.search, q) desc
    limit 30
  ),
  fused as (
    select coalesce(m.id, w.id) as id, coalesce(1.0 / (60 + m.rank), 0) + coalesce(1.0 / (60 + w.rank), 0) as score
    from by_meaning m full outer join by_words w on m.id = w.id
  )
  select p.id, p.source_id, p.heading, p.content, p.url, f.score
  from fused f join knowledge_passages p on p.id = f.id
  order by f.score desc
  limit match_count
$$;

-- Original uploads: private, readable by members of the organisation in the first folder.
insert into storage.buckets (id, name, public, file_size_limit)
values ('knowledge', 'knowledge', false, 10485760)
on conflict (id) do nothing;

create policy knowledge_files_member_read on storage.objects for select
  using (bucket_id = 'knowledge' and public.is_org_member(((storage.foldername(name))[1])::uuid));

-- Documents imported before company knowledge existed become sources, so they are searched
-- the same way.
insert into public.knowledge_sources (organization_id, kind, title, content, status, document_id, added_by, created_at)
select d.organization_id, case when d.source = 'paste' then 'paste' else 'file' end, d.title, d.content, 'queued', d.id, d.created_by, d.created_at
from public.documents d;
