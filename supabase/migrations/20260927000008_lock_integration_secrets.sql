-- Webhook signing secrets: row level security already denies every signed-in and anonymous
-- request (no policies exist). Remove the table privileges as well, so the secrets stay
-- server-only even if a policy were added by mistake.
revoke all on table public.integration_secrets from anon, authenticated;
