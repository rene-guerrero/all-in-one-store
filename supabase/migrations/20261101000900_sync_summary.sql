-- What each sync run changed (new products, restocks, sales, renames, new categories, products that
-- vanished from feria-ventas), shown to admins as the daily integration summary.
alter table public.sync_log add column summary jsonb;
