-- Self-healing. A run's heartbeat is its last sign of life (any save or step), so a stalled run
-- is told apart from a long healthy one, also after an approval resumed it. recovery_attempts
-- counts how often the healer restarted it, so a run is restarted at most once before it is
-- closed with a reason.
alter table public.agent_runs
  add column heartbeat_at timestamptz,
  add column recovery_attempts int not null default 0;
create index agent_runs_unfinished_idx on public.agent_runs (status, heartbeat_at) where status in ('queued', 'running', 'waiting_for_approval');
