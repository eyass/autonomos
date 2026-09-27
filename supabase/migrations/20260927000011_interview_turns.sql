-- Interview answers run as a background turn on the server; the page polls the session.
-- pending_since marks the turn in flight (and is its token: a cancelled or retried turn's
-- late result is discarded), turn_error a turn that failed or ran too long.
alter table public.discovery_sessions
  add column pending_answer text,
  add column pending_since timestamptz,
  add column turn_error text,
  add column suggestions jsonb not null default '[]';
