-- Deleting a workspace removes everything in it. Audit records stay append-only for
-- everyone else; only delete_organization() may remove them, as part of removing the
-- whole workspace.
create or replace function public.prevent_audit_mutation() returns trigger
language plpgsql as $$
begin
  if current_setting('autonomos.deleting_org', true) = old.organization_id::text then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'audit_events are append-only';
end;
$$;

create function public.delete_organization(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('autonomos.deleting_org', target::text, true);
  delete from public.organizations where id = target;
  perform set_config('autonomos.deleting_org', '', true);
end;
$$;
revoke all on function public.delete_organization(uuid) from public, anon, authenticated;
grant execute on function public.delete_organization(uuid) to service_role;
