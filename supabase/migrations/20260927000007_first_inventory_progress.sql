-- Progress of the first process inventory drafted at the end of onboarding, so the page
-- that shows it can follow each step (website, each connected system, drafting, saving).
alter table public.organizations add column initial_inventory jsonb;
