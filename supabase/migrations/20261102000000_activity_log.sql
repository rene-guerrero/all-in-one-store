-- Store activity for the admin "Actividad" tab: what admins changed (products, categories, photos)
-- and each SoftCell sync run. Written only by triggers, so changes made outside the admin page are
-- recorded too. Admin rows need a signed-in user (auth.uid()); the sync and import scripts use the
-- service key, so their bulk product writes are skipped and the sync is logged once per run instead.

create table public.activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  actor_kind text not null default 'admin' check (actor_kind in ('admin', 'integration')),
  action text not null,   -- created | updated | deleted | photo_added | photo_deleted | sync
  entity text not null,   -- product | category | photo | integration
  entity_id text,
  entity_name text,
  details jsonb
);
create index activity_log_at_idx on public.activity_log (at desc);
create index activity_log_actor_idx on public.activity_log (actor_email, at desc);

alter table public.activity_log enable row level security;
create policy "admins read activity" on public.activity_log
  for select to authenticated using (public.is_admin());

create function public.log_admin_activity(p_action text, p_entity text, p_id text, p_name text, p_details jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.activity_log (actor_id, actor_email, action, entity, entity_id, entity_name, details)
  values (auth.uid(), auth.jwt() ->> 'email', p_action, p_entity, p_id, p_name, p_details);
end $$;

-- Products: field-level diff on edits; timestamps and sync bookkeeping are ignored.
create function public.products_activity() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  changes jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.log_admin_activity('created', 'product', new.id::text, new.name,
      jsonb_build_object('category', new.category, 'stock', new.stock));
  elsif tg_op = 'DELETE' then
    perform public.log_admin_activity('deleted', 'product', old.id::text, old.name,
      jsonb_build_object('category', old.category, 'source', old.source));
  else
    if new.name is distinct from old.name then changes := changes || jsonb_build_object('name', jsonb_build_array(old.name, new.name)); end if;
    if new.category is distinct from old.category then changes := changes || jsonb_build_object('category', jsonb_build_array(old.category, new.category)); end if;
    if new.stock is distinct from old.stock then changes := changes || jsonb_build_object('stock', jsonb_build_array(old.stock, new.stock)); end if;
    if new.hidden is distinct from old.hidden then changes := changes || jsonb_build_object('hidden', jsonb_build_array(old.hidden, new.hidden)); end if;
    if new.description is distinct from old.description then changes := changes || jsonb_build_object('description', jsonb_build_array(old.description, new.description)); end if;
    if changes <> '{}'::jsonb then
      perform public.log_admin_activity('updated', 'product', new.id::text, new.name, jsonb_build_object('changes', changes));
    end if;
  end if;
  return null;
end $$;

create trigger products_activity
  after insert or update or delete on public.products
  for each row execute function public.products_activity();

create function public.categories_activity() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  changes jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.log_admin_activity('created', 'category', new.id::text, new.name, jsonb_build_object('icon', new.icon));
  elsif tg_op = 'DELETE' then
    perform public.log_admin_activity('deleted', 'category', old.id::text, old.name, null);
  else
    if new.name is distinct from old.name then changes := changes || jsonb_build_object('name', jsonb_build_array(old.name, new.name)); end if;
    if new.icon is distinct from old.icon then changes := changes || jsonb_build_object('icon', jsonb_build_array(old.icon, new.icon)); end if;
    if changes <> '{}'::jsonb then
      perform public.log_admin_activity('updated', 'category', new.id::text, new.name, jsonb_build_object('changes', changes));
    end if;
  end if;
  return null;
end $$;

create trigger categories_activity
  after insert or update or delete on public.categories
  for each row execute function public.categories_activity();

-- Photos: uploads and deletions (reordering is not logged). When a whole product is deleted its
-- photos go with it; that shows as the product deletion only.
create function public.product_images_activity() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  product_name text;
begin
  select name into product_name from public.products where id = coalesce(new.product_id, old.product_id);
  if product_name is null then return null; end if;
  if tg_op = 'INSERT' then
    perform public.log_admin_activity('photo_added', 'photo', new.product_id::text, product_name, jsonb_build_object('path', new.thumb_path, 'full', new.path));
  else
    perform public.log_admin_activity('photo_deleted', 'photo', old.product_id::text, product_name, null);
  end if;
  return null;
end $$;

create trigger product_images_activity
  after insert or delete on public.product_images
  for each row execute function public.product_images_activity();

-- One entry per SoftCell sync run, with its summary.
create function public.sync_log_activity() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.activity_log (at, actor_kind, actor_email, action, entity, entity_name, details)
  values (new.ran_at, 'integration', 'Integración SoftCell', 'sync', 'integration', 'feria-ventas',
    jsonb_build_object('ok', new.ok, 'products', new.product_count, 'error', new.error, 'summary', new.summary));
  return null;
end $$;

create trigger sync_log_activity
  after insert on public.sync_log
  for each row execute function public.sync_log_activity();

-- History so far: every sync run already recorded.
insert into public.activity_log (at, actor_kind, actor_email, action, entity, entity_name, details)
select ran_at, 'integration', 'Integración SoftCell', 'sync', 'integration', 'feria-ventas',
  jsonb_build_object('ok', ok, 'products', product_count, 'error', error, 'summary', summary)
from public.sync_log
order by ran_at;
