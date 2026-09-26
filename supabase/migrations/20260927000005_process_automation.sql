-- What discovery proposed an agent should do for this process, kept when the proposal is
-- added so the opportunity and the agent build on it.
alter table public.processes add column proposed_automation text;
