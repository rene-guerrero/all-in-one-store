-- Run once in the Supabase SQL editor (not a migration: it holds real values).
-- Replace the two placeholders, then run. The cron job in migrations reads these from Vault.
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/sync-products', 'sync_products_url');
select vault.create_secret('<same value as the CRON_SECRET function secret>', 'sync_products_secret');
