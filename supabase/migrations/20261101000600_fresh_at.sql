-- "Novedades" date: when a product last became news. Set on creation (feria-ventas' own creation date
-- for synced products), and moved to now() on a restock (stock goes up), an admin edit, or a new photo.
-- Sales (stock going down) and the daily sync re-sending the same data do not count.

alter table public.products add column fresh_at timestamptz;
update public.products set fresh_at = coalesce(source_created_at, created_at);
alter table public.products alter column fresh_at set not null;
create index products_fresh_at_idx on public.products (fresh_at desc);

create function public.products_fresh_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.fresh_at := coalesce(new.source_created_at, new.created_at, now());
  else
    new.fresh_at := old.fresh_at;
    -- The first sync after this column existed fills source_created_at; use it as the creation date.
    if old.source_created_at is null and new.source_created_at is not null and old.fresh_at = old.created_at then
      new.fresh_at := new.source_created_at;
    end if;
    if new.stock > old.stock then new.fresh_at := now(); end if;
    if new.updated_at is distinct from old.updated_at then new.fresh_at := now(); end if;
  end if;
  return new;
end $$;

create trigger products_fresh_at
  before insert or update on public.products
  for each row execute function public.products_fresh_at();

create function public.product_images_touch_product() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.products set fresh_at = now() where id = new.product_id;
  return new;
end $$;

create trigger product_images_touch_product
  after insert on public.product_images
  for each row execute function public.product_images_touch_product();
