-- Store catalog synced daily from the feria-ventas inventory.
-- Cost and sale prices are intentionally not stored: the public store shows no prices.

create table public.products (
  id uuid primary key,                 -- same id as productos.id in the source inventory
  name text not null,
  catalog_name text,
  category text,
  genero int,
  stock int not null default 0,
  active boolean not null default true,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  path text not null unique,           -- object path inside the product-images bucket
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort_order);

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table public.sync_log (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  product_count int,
  deactivated_count int,
  error text
);

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.admins enable row level security;
alter table public.sync_log enable row level security;

create policy "products are public" on public.products
  for select to anon, authenticated using (active or public.is_admin());

create policy "images are public" on public.product_images
  for select to anon, authenticated using (true);
create policy "admins add images" on public.product_images
  for insert to authenticated with check (public.is_admin());
create policy "admins edit images" on public.product_images
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete images" on public.product_images
  for delete to authenticated using (public.is_admin());

create policy "users see own admin row" on public.admins
  for select to authenticated using (user_id = auth.uid());

create policy "admins read sync log" on public.sync_log
  for select to authenticated using (public.is_admin());

-- Public bucket: anyone can view images by URL, only admins can change them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "admins read product images" on storage.objects
  for select to authenticated using (bucket_id = 'product-images' and public.is_admin());
create policy "admins upload product images" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and public.is_admin());
create policy "admins update product images" on storage.objects
  for update to authenticated using (bucket_id = 'product-images' and public.is_admin());
create policy "admins delete product images" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and public.is_admin());
