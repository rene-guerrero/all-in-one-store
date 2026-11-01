-- Product categories. source = 'feria' rows come from the feria-ventas inventory and are read-only;
-- admins create 'manual' ones and may rename or delete those. products.category keeps the name.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source text not null default 'manual' check (source in ('feria', 'manual')),
  created_at timestamptz not null default now()
);
create unique index categories_name_key on public.categories (lower(trim(name)));

insert into public.categories (name, source)
select distinct on (lower(trim(category))) trim(category), 'feria'
from public.products
where source = 'feria' and coalesce(trim(category), '') <> ''
order by lower(trim(category)), trim(category);

alter table public.categories enable row level security;

create policy "categories are public" on public.categories
  for select to anon, authenticated using (true);
create policy "admins add categories" on public.categories
  for insert to authenticated with check (public.is_admin() and source = 'manual');
create policy "admins edit own categories" on public.categories
  for update to authenticated using (public.is_admin() and source = 'manual') with check (public.is_admin() and source = 'manual');
create policy "admins delete own categories" on public.categories
  for delete to authenticated using (public.is_admin() and source = 'manual');

-- Renaming a category renames it on its products; deleting one that is still in use is refused.
create function public.categories_follow_changes() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.name is distinct from old.name then
    update public.products set category = new.name, updated_at = now()
    where lower(trim(category)) = lower(trim(old.name));
    return new;
  end if;
  if tg_op = 'DELETE' and exists (select 1 from public.products where lower(trim(category)) = lower(trim(old.name))) then
    raise exception 'La categoría "%" tiene productos. Muévelos a otra categoría antes de eliminarla.', old.name
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger categories_follow_changes
  before update or delete on public.categories
  for each row execute function public.categories_follow_changes();
