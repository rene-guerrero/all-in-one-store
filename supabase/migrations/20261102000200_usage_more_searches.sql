-- Return up to 100 searches so the "Para comprar" list (searches with no results) isn't cut off at the top 20.
create or replace function public.usage_stats(p_days int default 7) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  tz constant text := 'America/Havana';
  since timestamptz := (date_trunc('day', now() at time zone tz) - make_interval(days => greatest(p_days, 1) - 1)) at time zone tz;
  result jsonb;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;

  with ev as (select * from public.store_events where at >= since)
  select jsonb_build_object(
    'since', since,
    'totals', (select jsonb_build_object(
        'visitors', count(distinct visitor) filter (where type = 'visit'),
        'visits', count(*) filter (where type = 'visit'),
        'views', count(*) filter (where type = 'product_view'),
        'searches', count(*) filter (where type = 'search'),
        'carts', count(*) filter (where type = 'add_to_cart'),
        'whatsapp', count(*) filter (where type = 'whatsapp'),
        'orders', count(*) filter (where type = 'whatsapp' and meta ->> 'kind' = 'order')) from ev),
    'daily', (select coalesce(jsonb_agg(d order by d ->> 'day'), '[]'::jsonb) from (
        select jsonb_build_object('day', g.day::date,
          'visitors', count(distinct e.visitor) filter (where e.type = 'visit'),
          'visits', count(e.id) filter (where e.type = 'visit'),
          'whatsapp', count(e.id) filter (where e.type = 'whatsapp')) as d
        from generate_series((since at time zone tz)::date, (now() at time zone tz)::date, interval '1 day') as g(day)
        left join ev e on (e.at at time zone tz)::date = g.day::date
        group by g.day) x),
    'products', (select coalesce(jsonb_agg(p order by (p ->> 'views')::int desc, (p ->> 'carts')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('id', e.product_id, 'name', coalesce(pr.name, '(eliminado)'),
          'views', count(*) filter (where e.type = 'product_view'),
          'carts', count(*) filter (where e.type = 'add_to_cart')) as p
        from ev e left join public.products pr on pr.id = e.product_id
        where e.product_id is not null and e.type in ('product_view', 'add_to_cart')
        group by e.product_id, pr.name
        order by count(*) filter (where e.type = 'product_view') desc, count(*) filter (where e.type = 'add_to_cart') desc
        limit 15) x),
    'searches', (select coalesce(jsonb_agg(s order by (s ->> 'count')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('query', lower(trim(query)), 'count', count(*), 'visitors', count(distinct visitor),
          'results', round(avg(results))) as s
        from ev where type = 'search' and coalesce(trim(query), '') <> ''
        group by lower(trim(query)) order by count(*) desc limit 100) x),
    'contacts', (select coalesce(jsonb_agg(c order by c ->> 'at' desc), '[]'::jsonb) from (
        select jsonb_build_object('at', e.at, 'visitor', e.visitor, 'meta', e.meta,
          'product', (select name from public.products where id = e.product_id)) as c
        from ev e where e.type = 'whatsapp' order by e.at desc limit 60) x)
  ) into result;
  return result;
end $$;
