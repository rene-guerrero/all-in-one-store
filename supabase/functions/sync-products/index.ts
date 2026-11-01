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
  return [...toInsert.values()];
}

type Row = { id: string; name: string; category: string | null; stock: number };
const LIST_LIMIT = 100;

// Differences between what feria-ventas sent and what the store had before this run.
function summarize(before: Map<string, Row>, rows: Row[], newCategories: string[]) {
  const seen = new Set(rows.map((r) => r.id));
  const added: object[] = [], restocked: object[] = [], sold: object[] = [], changed: object[] = [];
  let unitsSold = 0, unitsRestocked = 0;
  for (const r of rows) {
    const old = before.get(r.id);
    if (!old) { added.push({ name: r.name, category: r.category, stock: r.stock }); continue; }
    if (r.stock > old.stock) { restocked.push({ name: r.name, from: old.stock, to: r.stock }); unitsRestocked += r.stock - old.stock; }
    if (r.stock < old.stock) { sold.push({ name: r.name, from: old.stock, to: r.stock }); unitsSold += old.stock - r.stock; }
    if (r.name !== old.name || (r.category ?? "") !== (old.category ?? "")) {
      changed.push({ from: old.name, to: r.name, categoryFrom: old.category, categoryTo: r.category });
    }
  }
  const missing = [...before.values()].filter((p) => !seen.has(p.id)).map((p) => ({ name: p.name, stock: p.stock }));
  return {
    counts: {
      added: added.length, restocked: restocked.length, sold: sold.length, changed: changed.length,
      missing: missing.length, categories: newCategories.length, unitsSold, unitsRestocked,
    },
    added: added.slice(0, LIST_LIMIT), restocked: restocked.slice(0, LIST_LIMIT), sold: sold.slice(0, LIST_LIMIT),
    changed: changed.slice(0, LIST_LIMIT), missing: missing.slice(0, LIST_LIMIT), categories: newCategories,
  };
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

    const { data: existing, error: existingError } = await db
      .from("products").select("id,name,category,stock").eq("source", "feria");
    if (existingError) throw existingError;
    const before = new Map<string, Row>(existing.map((p: Row) => [p.id, p]));

    if (rows.length) {
      const { error: upsertError } = await db.from("products").upsert(rows);
      if (upsertError) throw upsertError;
    }
    const newCategories = await syncCategories(db, rows.map((r) => r.category).filter((c): c is string => !!c));
    const summary = summarize(before, rows, newCategories);

    await db.from("sync_log").insert({ ok: true, product_count: rows.length, deactivated_count: 0, summary });
    return Response.json({ ok: true, products: rows.length, counts: summary.counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    await db.from("sync_log").insert({ ok: false, error: message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});
