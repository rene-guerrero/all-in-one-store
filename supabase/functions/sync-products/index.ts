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
  created_at: string | null;
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
      select: "id,nombre,descripcion,stock_actual,genero,created_at,updated_at,catalogo_productos(nombre,descripcion)",
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

// Every category used by feria-ventas becomes a read-only 'feria' category: missing ones are added,
// and a same-named category an admin created by hand is taken over.
// deno-lint-ignore no-explicit-any
async function syncCategories(db: any, names: string[]) {
  const { data: existing, error } = await db.from("categories").select("id,name,source");
  if (error) throw error;
  const byKey = new Map(existing.map((c: { name: string }) => [c.name.trim().toLowerCase(), c]));
  const toInsert = new Map<string, string>();
  const toClaim: string[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    const found = byKey.get(key) as { id: string; source: string } | undefined;
    if (!found) toInsert.set(key, name);
    else if (found.source !== "feria" && !toClaim.includes(found.id)) toClaim.push(found.id);
  }
  if (toInsert.size) {
    const { error: e } = await db.from("categories").insert([...toInsert.values()].map((name) => ({ name, source: "feria" })));
    if (e) throw e;
  }
  if (toClaim.length) {
    const { error: e } = await db.from("categories").update({ source: "feria" }).in("id", toClaim);
    if (e) throw e;
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

    // Only feria-ventas fields are sent, so on conflict the upsert overwrites those and leaves
    // admin-only fields (description, hidden, source) alone. Products that disappear from the
    // source are never deleted or deactivated here.
    const rows = source.map((p) => ({
      id: p.id,
      name: p.nombre.trim(),
      catalog_name: p.catalogo_productos?.nombre?.trim() ?? null,
      category: (p.descripcion ?? p.catalogo_productos?.descripcion ?? "").trim() || null,
      genero: p.genero,
      stock: p.stock_actual ?? 0,
      active: true,
      source_created_at: p.created_at,
      source_updated_at: p.updated_at,
      synced_at: runStartedAt,
    }));

    if (rows.length) {
      const { error: upsertError } = await db.from("products").upsert(rows);
      if (upsertError) throw upsertError;
    }
    await syncCategories(db, rows.map((r) => r.category).filter((c): c is string => !!c));

    await db.from("sync_log").insert({ ok: true, product_count: rows.length, deactivated_count: 0 });
    return Response.json({ ok: true, products: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    await db.from("sync_log").insert({ ok: false, error: message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});
