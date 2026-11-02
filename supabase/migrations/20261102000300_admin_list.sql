-- Admins with their emails, for the "Admin" filter in the Actividad tab (auth.users isn't readable
-- from the browser). Only admins may call it.
create function public.admin_list() returns table (user_id uuid, email text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query select a.user_id, u.email::text from public.admins a join auth.users u on u.id = a.user_id order by u.email;
end $$;

revoke all on function public.admin_list() from public, anon;
grant execute on function public.admin_list() to authenticated;
