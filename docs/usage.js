/* Admin "Uso" tab: store usage from anonymous store events. usage_stats() does the counting in the
   database; this file only draws it. Loaded after admin.js (uses sb, $, escapeHtml, quote). */
// The period is kept in the URL (?tab=usage&days=30) so a reload shows the same range.
const USAGE_DAYS = [1, 7, 30, 90];
let usageDays = USAGE_DAYS.includes(Number(new URLSearchParams(location.search).get("days")))
  ? Number(new URLSearchParams(location.search).get("days")) : 7;
const markUsageRange = () => $("#usage-range").querySelectorAll("[data-days]")
  .forEach((x) => x.setAttribute("aria-pressed", Number(x.dataset.days) === usageDays));
markUsageRange();

$("#usage-range").addEventListener("click", (e) => {
  const b = e.target.closest("[data-days]");
  if (!b) return;
  usageDays = Number(b.dataset.days);
  markUsageRange();
  const url = new URL(location.href);
  if (usageDays === 7) url.searchParams.delete("days");
  else url.searchParams.set("days", usageDays);
  history.replaceState(history.state, "", url);
  loadUsage();
});

async function loadUsage() {
  // Back/forward can land on a URL with another period.
  const fromUrl = Number(new URLSearchParams(location.search).get("days"));
  if (USAGE_DAYS.includes(fromUrl) && fromUrl !== usageDays) { usageDays = fromUrl; markUsageRange(); }
  $("#usage-status").textContent = "Cargando…";
  const { data, error } = await sb.rpc("usage_stats", { p_days: usageDays });
  if (error) {
    $("#usage-status").textContent = `No se pudieron cargar las estadísticas: ${error.message}`;
    return;
  }
  $("#usage-status").textContent = "";
  renderUsage(data);
}

const fmt = (n) => Number(n || 0).toLocaleString("es");
const visitorTag = (id) => `#${String(id || "").replace(/-/g, "").slice(0, 4)}`;

function renderUsage(s) {
  const t = s.totals;
  const tile = (value, label, hint = "") =>
    `<div class="kpi"><span class="kpi-value">${fmt(value)}</span><span class="kpi-label">${label}</span>${hint ? `<small>${hint}</small>` : ""}</div>`;
  const rate = t.visitors ? Math.round((t.whatsapp / t.visitors) * 100) : 0;
  $("#usage-kpis").innerHTML =
    tile(t.visitors, "Visitantes", `${fmt(t.visits)} visitas`) +
    tile(t.views, "Productos vistos") +
    tile(t.searches, "Búsquedas") +
    tile(t.carts, "Agregados al 🛒") +
    tile(t.whatsapp, "Contactos WhatsApp", t.visitors ? `${rate}% de los visitantes` : "") +
    tile(t.orders, "Pedidos enviados");

  renderDailyChart(s.daily);
  $("#usage-daily-card").hidden = s.daily.length < 2;

  const maxViews = Math.max(1, ...s.products.map((p) => p.views));
  $("#usage-products").innerHTML = s.products.length
    ? s.products.map((p) => `
      <li><span class="rank-name">${escapeHtml(p.name)}</span>
        <span class="rank-bar"><i style="width:${Math.max(4, (p.views / maxViews) * 100)}%"></i></span>
        <span class="rank-value">${fmt(p.views)}</span>
        ${p.carts ? `<span class="act-chip">🛒 ${fmt(p.carts)}</span>` : ""}</li>`).join("")
    : '<li class="rank-empty">Todavía nadie ha abierto un producto en este periodo.</li>';

  const maxSearch = Math.max(1, ...s.searches.map((q) => q.count));
  $("#usage-searches").innerHTML = s.searches.length
    ? s.searches.slice(0, 20).map((q) => `
      <li><span class="rank-name">“${escapeHtml(q.query)}”</span>
        <span class="rank-bar"><i style="width:${Math.max(4, (q.count / maxSearch) * 100)}%"></i></span>
        <span class="rank-value">${fmt(q.count)}</span>
        ${Number(q.results) === 0 ? '<span class="act-chip warn" title="No encontraron nada: quizás vale la pena tenerlo">sin resultados</span>' : ""}</li>`).join("")
    : '<li class="rank-empty">Todavía no hay búsquedas en este periodo.</li>';

  // Searches that found nothing in stock: candidates to buy, most searched (by different visitors) first.
  const toBuy = s.searches.filter((q) => Number(q.results) === 0)
    .sort((a, b) => b.visitors - a.visitors || b.count - a.count);
  const maxBuy = Math.max(1, ...toBuy.map((q) => q.visitors));
  $("#usage-to-buy").innerHTML = toBuy.length
    ? toBuy.map((q) => `
      <li><span class="rank-name">“${escapeHtml(q.query)}”</span>
        <span class="rank-bar"><i style="width:${Math.max(4, (q.visitors / maxBuy) * 100)}%"></i></span>
        <span class="rank-value" title="Personas distintas que lo buscaron">${fmt(q.visitors)}</span>
        <span class="act-chip">${fmt(q.count)} ${q.count === 1 ? "búsqueda" : "búsquedas"}</span></li>`).join("")
    : '<li class="rank-empty">Nada pendiente: todo lo que buscaron en este periodo estaba disponible.</li>';

  $("#usage-contacts").innerHTML = s.contacts.length
    ? s.contacts.map(contactHtml).join("")
    : '<li class="rank-empty">Todavía nadie ha tocado WhatsApp en este periodo.</li>';
}

function contactHtml(c) {
  const m = c.meta || {};
  const when = new Date(c.at).toLocaleString("es", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  let text;
  let extra = "";
  if (m.kind === "order") {
    const items = m.items || [];
    const units = items.reduce((n, i) => n + (i.qty || 1), 0);
    text = `<strong>Pedido</strong> de ${units} ${units === 1 ? "producto" : "productos"}${m.name ? ` · ${escapeHtml(m.name)}` : ""} · ${m.delivery === "home" ? "a domicilio" : "recoger en tienda"}`;
    extra = `<details class="act-details"><summary>Ver productos</summary><ul>${items.map((i) => `<li>${escapeHtml(i.name || "?")} × ${i.qty}</li>`).join("")}</ul></details>`;
  } else if (m.kind === "product") {
    text = `<strong>Consulta</strong> sobre ${quote(c.product || "un producto")}`;
  } else {
    text = `<strong>Chat</strong> desde el botón ${m.from === "footer" ? "del pie de página" : "del encabezado"}`;
  }
  const emoji = m.kind === "order" ? "🛒" : m.kind === "product" ? "📱" : "💬";
  return `<li><span class="contact-kind ${m.kind || "general"}">${emoji}</span>
    <div class="act-body"><p>${text}</p>${extra}</div>
    <span class="contact-meta"><time>${when}</time><small title="Mismo número = mismo navegador">Visitante ${visitorTag(c.visitor)}</small></span></li>`;
}

// Unique visitors per day: one series, one hue, a tooltip per bar (no legend needed).
function renderDailyChart(days) {
  const max = Math.max(1, ...days.map((d) => d.visitors));
  const dayName = (d) => new Date(`${d.day}T12:00:00`).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
  const step = days.length > 31 ? 7 : days.length > 10 ? 3 : 1;
  $("#usage-daily").innerHTML = `
    <div class="bar-axis"><span>${fmt(max)}</span><span>0</span></div>
    <div class="bars" style="--n:${days.length}">
      ${days.map((d, i) => `<button type="button" class="bar"
          data-tip="${escapeHtml(dayName(d))}: ${fmt(d.visitors)} visitantes · ${fmt(d.visits)} visitas · ${fmt(d.whatsapp)} WhatsApp"
          aria-label="${escapeHtml(dayName(d))}: ${d.visitors} visitantes">
        <i style="height:${d.visitors ? Math.max(3, (d.visitors / max) * 100) : 0}%"></i>
        <span class="bar-x">${i % step === 0 || i === days.length - 1 ? new Date(`${d.day}T12:00:00`).getDate() : ""}</span>
      </button>`).join("")}
    </div>
    <div class="chart-tip" id="chart-tip" hidden></div>`;
}

function showTip(bar) {
  const tip = $("#chart-tip");
  if (!bar || !tip) return;
  tip.textContent = bar.dataset.tip;
  tip.hidden = false;
  const box = $("#usage-daily").getBoundingClientRect();
  const r = bar.getBoundingClientRect();
  tip.style.left = `${Math.min(Math.max(0, r.left - box.left + r.width / 2 - tip.offsetWidth / 2), box.width - tip.offsetWidth)}px`;
}
$("#usage-daily").addEventListener("pointerover", (e) => showTip(e.target.closest(".bar")));
$("#usage-daily").addEventListener("focusin", (e) => showTip(e.target.closest(".bar")));
$("#usage-daily").addEventListener("pointerleave", () => { const tip = $("#chart-tip"); if (tip) tip.hidden = true; });
