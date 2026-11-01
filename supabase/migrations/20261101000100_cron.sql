-- Daily inventory sync: pg_cron calls the sync-products Edge Function through pg_net.
-- The function URL and shared secret live in Vault (see scripts/setup-cron-secrets.sql),
-- so nothing secret is committed here.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 09:00 UTC = 05:00 in Cuba (04:00 during daylight saving).
select cron.schedule(
  'sync-products-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_products_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_products_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
