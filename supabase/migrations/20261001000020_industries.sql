-- The industry list is now digital-first (packages/schemas INDUSTRIES). Older names are mapped
-- to their successors, in the organization and in the profile drafted from its website.
create or replace function pg_temp.new_industry(old text) returns text language sql immutable as $$
  select case old
    when 'SaaS' then 'SaaS & software'
    when 'Marketplace' then 'Marketplaces'
    when 'E-commerce' then 'E-commerce & D2C'
    when 'Recruitment' then 'Recruitment & staffing'
    when 'Property services' then 'Property & rentals'
    when 'Travel' then 'Travel & booking'
    when 'Agency' then 'Agencies'
    when 'Insurance intermediary' then 'Fintech & insurance'
    else old
  end
$$;

update public.organizations set industry = pg_temp.new_industry(industry) where industry is distinct from pg_temp.new_industry(industry);
update public.organizations
  set website_profile = jsonb_set(website_profile, '{industry}', to_jsonb(pg_temp.new_industry(website_profile ->> 'industry')))
  where website_profile ? 'industry' and website_profile ->> 'industry' is distinct from pg_temp.new_industry(website_profile ->> 'industry');

-- Playbooks name the industries they suit; one playbook can serve several.
alter table public.playbooks add column industries text[] not null default '{}';
create index playbooks_industries_idx on public.playbooks using gin (industries);
