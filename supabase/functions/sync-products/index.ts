// Pulls the active inventory from the feria-ventas Supabase project and upserts it
// into this project's products table. Called daily by pg_cron (see migrations).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const PAGE_SIZE = 1000;

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

type SourceProduct = {
  id: string;
  nombre: string;
  descripcion: string | null;
  stock_actual: number | null;
  genero: number | null;
  updated_at: string | null;
  catalogo_productos: { nombre: string | null; descripcion: string | null } | null;
};

async function fetchSourceProducts(): Promise<SourceProduct[]> {
  const url = env("SOURCE_SUPABASE_URL");
  const anonKey = env("SOURCE_SUPABASE_ANON_KEY");

  const auth = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: env("SOURCE_EMAIL"), password: env("SOURCE_PASSWORD") }),
  });
  if (!auth.ok) throw new Error(`Source login failed: ${auth.status} ${await auth.text()}`);
  const { access_token } = await auth.json();

  const products: SourceProduct[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      select: "id,nombre,descripcion,stock_actual,genero,updated_at,catalogo_productos(nombre,descripcion)",
      activo: "eq.true",
      usuario_id: `eq.${env("SOURCE_USUARIO_ID")}`,
      order: "nombre.asc",
      offset: String(offset),
      limit: String(PAGE_SIZE),
    });
    const res = await fetch(`${url}/rest/v1/productos?${params}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${access_token}` },
    });
    if (!res.ok) throw new Error(`Source query failed: ${res.status} ${await res.text()}`);
    const page: SourceProduct[] = await res.json();
    products.push(...page);
    if (page.length < PAGE_SIZE) return products;
  }
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== env("CRON_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const runStartedAt = new Date().toISOString();

  try {
    const source = await fetchSourceProducts();
    if (source.length === 0) throw new Error("Source returned 0 products; refusing to deactivate the whole catalog");

    const rows = source.map((p) => ({
      id: p.id,
      name: p.nombre.trim(),
      catalog_name: p.catalogo_productos?.nombre?.trim() ?? null,
      category: (p.descripcion ?? p.catalogo_productos?.descripcion ?? "").trim() || null,
      genero: p.genero,
      stock: p.stock_actual ?? 0,
      active: true,
      source_updated_at: p.updated_at,
      synced_at: runStartedAt,
    }));

    const { error: upsertError } = await db.from("products").upsert(rows);
    if (upsertError) throw upsertError;

    // Anything not seen in this run was deleted or deactivated in the source.
    const { count, error: deactivateError } = await db
      .from("products")
      .update({ active: false }, { count: "exact" })
      .lt("synced_at", runStartedAt)
      .eq("active", true);
    if (deactivateError) throw deactivateError;

    await db.from("sync_log").insert({ ok: true, product_count: rows.length, deactivated_count: count ?? 0 });
    return Response.json({ ok: true, products: rows.length, deactivated: count ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    await db.from("sync_log").insert({ ok: false, error: message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});
