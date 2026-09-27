-- Discovery quality. A thin process (low confidence, no workflow, or no numbers) is kept as a
-- candidate outside the working inventory until someone fills it in. Work in sensitive areas
-- (payments, collections, personal data, legal) names who signs off on compliance before
-- automation ideas are generated for it.
alter type process_status add value if not exists 'candidate';
alter table public.processes
  add column compliance_owner text,
  add column compliance_confirmed_at timestamptz,
  add column compliance_confirmed_by uuid references public.users (id);
-- Provenance: whether a process was mapped from sample (sandbox) data, live accounts, or both.
alter table public.processes add column source_data text check (source_data in ('sandbox', 'live', 'mixed'));
