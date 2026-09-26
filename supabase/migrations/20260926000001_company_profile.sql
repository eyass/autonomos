-- Agentic onboarding: the profile AutonomOS drafted from the company website, and the
-- tools it detected there (script signatures and MX records). Both are evidence the
-- user reviewed during onboarding; they are refreshed from Settings.
alter table public.organizations
  add column website_profile jsonb,
  add column website_profiled_at timestamptz,
  add column detected_tools text[] not null default '{}';

comment on column public.organizations.website_profile is 'Company profile drafted from the public website (CompanyProfileSchema), plus the pages it was read from';
comment on column public.organizations.detected_tools is 'Integration keys detected on the website or in MX records, for example zendesk, stripe, gmail';

-- Processes drafted from the company profile during onboarding.
alter type discovery_source add value if not exists 'website';
