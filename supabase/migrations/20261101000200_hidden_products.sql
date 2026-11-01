-- Lets the store hide individual products (e.g. test items) without touching the source inventory.
-- The sync never writes this column, so a hidden product stays hidden across daily syncs.
alter table public.products add column hidden boolean not null default false;

drop policy "products are public" on public.products;
create policy "products are public" on public.products
  for select to anon, authenticated using ((active and not hidden) or public.is_admin());

update public.products set hidden = true where name ilike 'producto prueba%';
