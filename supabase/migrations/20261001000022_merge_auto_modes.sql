-- Agents now run in four modes: Manual (1), Draft (2), Approve (3) and Auto (4). The former
-- levels 4 and 5 behaved the same in the policy engine and are now both Auto. Agent versions
-- are immutable and keep their 5, which the app reads as Auto.
update public.agents set autonomy_level = 4 where autonomy_level = 5;
update public.processes set current_autonomy_level = 4 where current_autonomy_level = 5;
update public.processes set potential_autonomy_level = 4 where potential_autonomy_level = 5;
update public.automation_opportunities set current_autonomy_level = 4 where current_autonomy_level = 5;
update public.automation_opportunities set target_autonomy_level = 4 where target_autonomy_level = 5;
