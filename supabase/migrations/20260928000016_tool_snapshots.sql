-- Agents can use any connected Composio toolkit's actions. Each version stores the definition of
-- those tools (name, read or write, risk, input schema) as it was when the version was made, so a
-- version always runs with the tool it was built and tested with. Built-in tools leave it null.
alter table public.agent_tools add column definition jsonb;
