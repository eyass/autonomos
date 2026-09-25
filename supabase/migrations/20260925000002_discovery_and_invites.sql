-- Processes extracted so far during a guided interview, before they are saved.
alter table public.discovery_sessions add column extracted jsonb not null default '[]';
alter table public.discovery_sessions add column department_name text;

-- Invited users join the organisation on first sign-in with the invited email.
create function public.accept_pending_invites() returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  user_email text;
  accepted int := 0;
begin
  if uid is null then
    return 0;
  end if;
  select email into user_email from public.users where id = uid;
  with pending as (
    update public.organization_invites i
       set accepted_at = now()
     where lower(i.email) = lower(user_email) and i.accepted_at is null
    returning i.organization_id, i.role
  )
  insert into public.organization_members (organization_id, user_id, role)
  select organization_id, uid, role from pending
  on conflict (organization_id, user_id) do nothing;
  get diagnostics accepted = row_count;
  return accepted;
end;
$$;

revoke all on function public.accept_pending_invites() from public;
grant execute on function public.accept_pending_invites() to authenticated;
