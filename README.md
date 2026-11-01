# All in One · Catálogo

Static store catalog hosted on Cloudflare Pages (https://allinone-holguin.pages.dev, deployed from `docs/`), backed by Supabase.

- `docs/index.html`: public catalog (no prices, sold-out products hidden).
- `docs/admin.html`: admin page to upload/reorder/delete product photos (Supabase Auth, admins only).
- `supabase/functions/sync-products`: pulls the active inventory from the feria-ventas system and upserts it into `products`.
- `supabase/migrations`: schema, row-level security, storage bucket, and the daily `pg_cron` job (09:00 UTC) that calls the sync function.

## Secrets

Nothing secret is committed. The sync function reads `SOURCE_*` and `CRON_SECRET` from Supabase function secrets;
the cron job reads the function URL and `CRON_SECRET` from Supabase Vault (`scripts/setup-cron-secrets.sql`).
Local copies live in the gitignored `.env`.

## Common tasks

```bash
npx supabase functions deploy sync-products --use-api   # redeploy the sync
npx supabase db push                                    # apply new migrations
npx wrangler pages deploy docs --project-name allinone-holguin --branch main   # publish the site
```

Run a sync now: `POST https://<ref>.supabase.co/functions/v1/sync-products` with header `x-cron-secret`.
Sync history is in the `sync_log` table.
