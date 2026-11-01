-- Admins can create, edit and delete products.
-- source = 'feria' rows come from the daily sync, which overwrites their inventory fields
-- (name, catalog_name, category, genero, stock) every run but never deletes or deactivates them.
-- source = 'manual' rows are created in the admin page and the sync never touches them.

alter table public.products
  add column source text not null default 'feria' check (source in ('feria', 'manual')),
  add column description text,
  add column updated_at timestamptz not null default now(),
  alter column id set default gen_random_uuid();

-- Products the old sync had deactivated come back; the sync no longer deactivates anything.
update public.products set active = true where not active;

create policy "admins add products" on public.products
  for insert to authenticated with check (public.is_admin());
create policy "admins edit products" on public.products
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete products" on public.products
  for delete to authenticated using (public.is_admin());
