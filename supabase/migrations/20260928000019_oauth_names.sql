-- People who sign in with Microsoft or GitHub: take their name from whichever field the provider
-- fills (full_name, name, or the GitHub username as a last resort).
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  full_name text := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), nullif(new.raw_user_meta_data ->> 'user_name', ''), '');
begin
  insert into public.users (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', split_part(full_name, ' ', 1), ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', nullif(regexp_replace(full_name, '^\S+\s*', ''), ''), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
