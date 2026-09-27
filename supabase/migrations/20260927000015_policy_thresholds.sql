-- The company's own policy numbers for work in a regulated area (refund approval and hard limits,
-- collections thresholds, consent basis and deadlines). Required before an agent is built or goes
-- live for such a process; money limits are enforced by the policy engine.
alter table public.processes add column policy_thresholds jsonb not null default '{}';

-- Drafts found before the quality floor existed: AI drafts that are still thin (low confidence,
-- fewer than two steps, or no numbers) become candidates, so no hours or value are shown for them
-- until someone fills them in. Approved and manual processes are left alone.
update public.processes p
set status = 'candidate'
where p.status = 'draft'
  and p.confidence is not null
  and (
    p.confidence < 0.5
    or coalesce(p.estimated_occurrences_per_month, 0) = 0
    or coalesce(p.estimated_minutes_per_occurrence, 0) = 0
    or (select count(*) from public.process_steps s where s.process_id = p.id) < 2
  );
