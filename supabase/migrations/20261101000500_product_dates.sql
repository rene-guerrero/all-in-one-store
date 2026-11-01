-- When a product was added, for the store's "Novedades" sort: feria-ventas' own created_at for synced
-- products (filled by the sync), the row's creation time for products made in the admin.
alter table public.products
  add column created_at timestamptz not null default now(),
  add column source_created_at timestamptz;
