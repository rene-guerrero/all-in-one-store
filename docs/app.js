const { SUPABASE_URL, SUPABASE_ANON_KEY, STORE } = window.STORE_CONFIG;
const IMAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/product-images/`;
const ICONS = {
  photos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m21 16-5-5-8 8"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  cartAdd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2.5l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L21 8H6.3"/><circle cx="9.5" cy="19.5" r="1.5"/><circle cx="17.5" cy="19.5" r="1.5"/><path d="M14 9.5v3M12.5 11h3"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
};

const ALL_ICON = svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>');

// Empty sets mean "all"; several brands or categories mean "any of these".
const state = { products: [], categories: new Set(), brands: new Set(), query: "", sort: "novedades", onlyPhotos: false };
const brandFilter = createMultiSelect(document.getElementById("brand-ms"), {
  label: "Marca",
  onChange: (values) => { state.brands = values; renderGrid(); },
});
const categoryFilter = createMultiSelect(document.getElementById("category-ms"), {
  label: "Categoría",
  onChange: (values) => setCategories(values),
});
const NEW_DAYS = 14;
const $ = (sel) => document.querySelector(sel);

const fold = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const whatsappLink = (text) => `https://wa.me/${STORE.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ""}`;


function fillStoreInfo() {
  document.querySelectorAll("[data-store]").forEach((el) => { el.textContent = STORE[el.dataset.store] || ""; });
  $("#header-whatsapp").href = whatsappLink(`Hola, vengo del catálogo de ${STORE.name}.`);
  $("#footer-facebook").href = STORE.facebook;
  $("#footer-phone").href = `tel:+${STORE.whatsapp}`;
  $("#footer-whatsapp").href = whatsappLink(`Hola, vengo del catálogo de ${STORE.name}.`);
  // Coordinates pin the exact shop; the street address alone lands in the wrong place on Google Maps.
  const mapQuery = STORE.location || `${STORE.address}, Holguín, Cuba`;
  $("#footer-address").href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;
}

async function loadProducts() {
  const params = new URLSearchParams({
    select: "id,name,category,stock,description,fresh_at,created_at,source_created_at,product_images(path,thumb_path,sort_order)",
    active: "eq.true",
    stock: "gt.0",
    order: "fresh_at.desc",
  });
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
  const [res, catRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/products?${params}`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/categories?select=name,icon&icon=not.is.null`, { headers }),
  ]);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  // Icons admins chose for their own categories; a failure here just keeps the default icons.
  if (catRes.ok) setCategoryIconChoices(await catRes.json());

  // "Audifonos" and "Audífonos" are the same category; keep the accented spelling.
  const categoryLabels = {};
  for (const p of rows) {
    const key = fold(p.category) || "otros";
    const label = (p.category || "Otros").trim();
    const hasAccent = /[̀-ͯ]/.test(label.normalize("NFD"));
    if (!categoryLabels[key] || hasAccent) categoryLabels[key] = label;
  }

  return rows.map((p) => {
    const photos = (p.product_images || []).sort((a, b) => a.sort_order - b.sort_order);
    const images = photos.map((i) => IMAGE_BASE + i.path);
    const thumbs = photos.map((i) => IMAGE_BASE + (i.thumb_path || i.path));
    const categoryKey = fold(p.category) || "otros";
    const addedAt = new Date(p.source_created_at || p.created_at).getTime();
    return {
      ...p,
      images,
      thumbs,
      categoryKey,
      categoryLabel: categoryLabels[categoryKey],
      brand: brandOf(p.name),
      search: fold(`${p.name} ${p.category}`),
      freshAt: new Date(p.fresh_at).getTime(),
      isNew: Date.now() - addedAt < NEW_DAYS * 864e5,
    };
  });
}

// "Novedades": newest additions, restocks and edits first (fresh_at, kept by the database).
const SORTS = {
  novedades: (a, b) => b.freshAt - a.freshAt || a.name.localeCompare(b.name, "es"),
  az: (a, b) => a.name.localeCompare(b.name, "es", { numeric: true }),
};

function renderFilters() {
  const counts = {};
  const labels = {};
  for (const p of state.products) {
    counts[p.categoryKey] = (counts[p.categoryKey] || 0) + 1;
    labels[p.categoryKey] = p.categoryLabel;
  }
  const keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const chip = (key, icon, label, count) =>
    `<button class="chip" data-category="${escapeHtml(key)}">${icon}${escapeHtml(label)}<span class="count">${count}</span></button>`;
  $("#categories").innerHTML = chip("", ALL_ICON, "Todo", state.products.length) +
    keys.map((k) => chip(k, categoryIcon(k), labels[k], counts[k])).join("");
  syncChips();
  updateChipFade();

  categoryFilter.setOptions(keys.map((k) => ({ value: k, label: labels[k], count: counts[k], icon: categoryIcon(k) })));

  const brandCounts = {};
  for (const p of state.products) if (p.brand) brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
  brandFilter.setOptions(Object.keys(brandCounts).sort().map((b) => ({ value: b, label: b, count: brandCounts[b] })));
}

// Category chips (desktop) and the category dropdown (phones) share state.categories.
function setCategories(keys) {
  state.categories = new Set(keys);
  categoryFilter.setSelected(state.categories);
  syncChips();
  renderGrid();
}

function syncChips() {
  $("#categories").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed",
    c.dataset.category ? state.categories.has(c.dataset.category) : state.categories.size === 0));
}

// Fade whichever edge of the chip row has more chips hidden behind it.
function updateChipFade() {
  const row = $("#categories");
  row.classList.toggle("fade-start", row.scrollLeft > 4);
  row.classList.toggle("fade-end", row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
}

function filtered() {
  const terms = fold(state.query).split(/\s+/).filter(Boolean);
  return state.products.filter((p) =>
    (!state.categories.size || state.categories.has(p.categoryKey)) &&
    (!state.brands.size || state.brands.has(p.brand)) &&
    (!state.onlyPhotos || p.images.length > 0) &&
    terms.every((t) => p.search.includes(t)))
    .sort(SORTS[state.sort] || SORTS.novedades);
}

function cardHtml(p) {
  const media = p.images.length
    ? `<img src="${escapeHtml(p.thumbs[0])}" alt="${escapeHtml(p.name)}" loading="lazy">` +
      (p.images.length > 1 ? `<span class="photo-count">${ICONS.photos}${p.images.length}</span>` : "")
    : `<div class="placeholder">${categoryIcon(p.categoryKey)}</div>`;
  const inCart = !!order.items[p.id];
  return `<div class="card-wrap">
    <button class="card" data-id="${p.id}">
      <div class="card-media">${media}${p.isNew ? '<span class="badge-new">Nuevo</span>' : ""}</div>
      <div class="card-body">
        <span class="card-category">${categoryIcon(p.categoryKey)}${escapeHtml(p.categoryLabel)}</span>
        <span class="card-name">${escapeHtml(p.name)}</span>
        ${p.stock <= 2 ? '<span class="badge-low">Últimas unidades</span>' : ""}
      </div>
    </button>
    <button class="add-cart ${inCart ? "in" : ""}" type="button" data-add="${p.id}" aria-pressed="${inCart}"
      aria-label="${inCart ? "Quitar del pedido" : "Agregar al pedido"}: ${escapeHtml(p.name)}">${inCart ? ICONS.check : ICONS.cartAdd}</button>
  </div>`;
}

/* Order list (🛒): customers collect products and send them in one WhatsApp message.
   Kept in this browser only (localStorage) as a convenience; no prices, the shop confirms in the chat. */
const ORDER_KEY = "aio-order";
const ORDER_FORM_KEY = "aio-order-form";
const readStored = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const writeStored = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };
const order = { items: readStored(ORDER_KEY, {}) }; // { productId: quantity }

const productById = (id) => state.products.find((p) => p.id === id);
const orderTotal = () => Object.values(order.items).reduce((sum, q) => sum + q, 0);

function saveOrder() {
  writeStored(ORDER_KEY, order.items);
  const total = orderTotal();
  $("#cart-count").textContent = total;
  $("#cart-count").hidden = total === 0;
}

// Drop products that sold out or disappeared since the list was saved, and cap quantities at stock.
function reconcileOrder() {
  for (const [id, qty] of Object.entries(order.items)) {
    const p = productById(id);
    if (!p) delete order.items[id];
    else order.items[id] = Math.max(1, Math.min(qty, p.stock));
  }
  saveOrder();
}

let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

function toggleInOrder(id) {
  const p = productById(id);
  if (!p) return;
  if (order.items[id]) {
    delete order.items[id];
    toast(`Quitado del pedido: ${p.name}`);
  } else {
    order.items[id] = 1;
    toast(`🛒 Agregado al pedido: ${p.name}`);
  }
  saveOrder();
  syncOrderButtons(id);
}

function syncOrderButtons(id) {
  const inCart = !!order.items[id];
  document.querySelectorAll(`[data-add="${id}"]`).forEach((b) => {
    b.classList.toggle("in", inCart);
    b.setAttribute("aria-pressed", inCart);
    b.innerHTML = inCart ? ICONS.check : ICONS.cartAdd;
  });
  if (current.product?.id === id) syncViewerAdd();
}

function syncViewerAdd() {
  const inCart = !!order.items[current.product.id];
  $("#viewer-add").classList.toggle("in", inCart);
  $("#viewer-add span").textContent = inCart ? "En tu pedido · quitar" : "Agregar al pedido";
}

function renderOrder() {
  const entries = Object.entries(order.items).map(([id, qty]) => ({ p: productById(id), qty })).filter((e) => e.p);
  $("#cart-empty").hidden = entries.length > 0;
  $("#cart-form").hidden = entries.length === 0;
  $("#cart-title").textContent = entries.length ? `🛒 Mi pedido (${orderTotal()})` : "🛒 Mi pedido";
  $("#cart-items").innerHTML = entries.map(({ p, qty }) => `
    <li data-item="${p.id}">
      ${p.thumbs.length ? `<img src="${escapeHtml(p.thumbs[0])}" alt="">` : `<span class="cart-thumb">${categoryIcon(p.categoryKey)}</span>`}
      <span class="cart-name">${escapeHtml(p.name)}<small>${escapeHtml(p.categoryLabel)}</small></span>
      <span class="qty">
        <button type="button" data-qty="-1" aria-label="Menos" ${qty <= 1 ? "disabled" : ""}>−</button>
        <output>${qty}</output>
        <button type="button" data-qty="1" aria-label="Más" ${qty >= p.stock ? "disabled" : ""}>+</button>
      </span>
      <button type="button" class="cart-remove" data-remove="${p.id}" aria-label="Quitar ${escapeHtml(p.name)}">✕</button>
    </li>`).join("");
}

function openOrder() {
  reconcileOrder();
  renderOrder();
  const saved = readStored(ORDER_FORM_KEY, {});
  const form = $("#cart-form");
  for (const field of ["name", "address", "note"]) if (saved[field] && !form.elements[field].value) form.elements[field].value = saved[field];
  if (saved.delivery) form.elements.delivery.value = saved.delivery;
  $("#cart-address-wrap").hidden = form.elements.delivery.value !== "home";
  $("#cart-status").textContent = "";
  $("#cart").showModal();
}

function orderMessage(form) {
  const lines = Object.entries(order.items)
    .map(([id, qty]) => ({ p: productById(id), qty })).filter((e) => e.p)
    .map(({ p, qty }, i) => `${i + 1}. ${p.name} × ${qty}`);
  const home = form.elements.delivery.value === "home";
  const name = form.elements.name.value.trim();
  const note = form.elements.note.value.trim();
  return [
    `Hola${name ? `, soy ${name}` : ""}. Quiero hacer este pedido en ${STORE.name}:`, "",
    ...lines, "",
    home ? `🚚 Entrega a domicilio: ${form.elements.address.value.trim()}` : "🏪 Recogeré en la tienda",
    ...(note ? [`📝 Nota: ${note}`] : []), "",
    "¿Me confirman precio y disponibilidad? Gracias.",
  ].join("\n");
}

function bindOrder() {
  $("#cart-button").addEventListener("click", openOrder);
  $("#cart-close").addEventListener("click", () => $("#cart").close());
  $("#cart").addEventListener("click", (e) => { if (e.target === $("#cart")) $("#cart").close(); });
  $("#viewer-add").addEventListener("click", () => toggleInOrder(current.product.id));
  $("#cart-items").addEventListener("click", (e) => {
    const row = e.target.closest("[data-item]");
    if (!row) return;
    const id = row.dataset.item;
    const step = e.target.closest("[data-qty]");
    if (step) {
      order.items[id] = Math.max(1, Math.min(order.items[id] + Number(step.dataset.qty), productById(id).stock));
    } else if (e.target.closest("[data-remove]")) {
      delete order.items[id];
      syncOrderButtons(id);
    } else return;
    saveOrder();
    renderOrder();
  });
  $("#cart-form").addEventListener("change", (e) => {
    if (e.target.name === "delivery") $("#cart-address-wrap").hidden = e.target.value !== "home";
  });
  $("#cart-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const status = $("#cart-status");
    if (form.elements.delivery.value === "home" && !form.elements.address.value.trim()) {
      status.textContent = "Escribe la dirección de entrega.";
      status.classList.add("error");
      form.elements.address.focus();
      return;
    }
    status.classList.remove("error");
    writeStored(ORDER_FORM_KEY, {
      name: form.elements.name.value.trim(), address: form.elements.address.value.trim(),
      note: "", delivery: form.elements.delivery.value,
    });
    window.open(whatsappLink(orderMessage(form)), "_blank", "noopener");
    status.textContent = "Se abrió WhatsApp con tu pedido. Cuando lo envíes, puedes vaciar la lista.";
  });
  $("#cart-clear").addEventListener("click", () => {
    if (!confirm("¿Vaciar el pedido?")) return;
    const ids = Object.keys(order.items);
    order.items = {};
    saveOrder();
    ids.forEach(syncOrderButtons);
    renderOrder();
  });
}

function renderGrid() {
  const list = filtered();
  $("#result-info").textContent = `${list.length} ${list.length === 1 ? "producto" : "productos"}`;
  $("#grid").innerHTML = list.length
    ? list.map(cardHtml).join("")
    : '<div class="empty" style="grid-column:1/-1">No encontramos productos con ese filtro. Escríbenos por WhatsApp y te ayudamos.</div>';
}

/* Viewer */
let current = { product: null, index: 0 };

function showImage(index) {
  const { images } = current.product;
  current.index = (index + images.length) % images.length;
  $("#gallery").querySelector("img").src = images[current.index];
  $("#thumbs").querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-current", i === current.index));
}

function openViewer(product) {
  current = { product, index: 0 };
  const { images } = product;
  $("#viewer-title").textContent = product.name;
  $("#viewer-description").textContent = product.description || "";
  $("#viewer-description").hidden = !product.description;
  $("#viewer-category").innerHTML = categoryIcon(product.categoryKey) + escapeHtml(product.categoryLabel);
  $("#viewer-whatsapp").href = whatsappLink(`Hola, me interesa: ${product.name}. ¿Precio y disponibilidad?`);
  $("#gallery").innerHTML = images.length
    ? `<img alt="${escapeHtml(product.name)}">` + (images.length > 1
      ? `<button class="gallery-nav prev" aria-label="Foto anterior">${ICONS.prev}</button><button class="gallery-nav next" aria-label="Foto siguiente">${ICONS.next}</button>`
      : "")
    : `<div class="placeholder">${categoryIcon(product.categoryKey)}</div>`;
  $("#thumbs").innerHTML = images.length > 1
    ? product.thumbs.map((src, i) => `<button data-index="${i}" aria-label="Foto ${i + 1}"><img src="${escapeHtml(src)}" alt="" loading="lazy"></button>`).join("")
    : "";
  $("#thumbs").hidden = images.length < 2;
  if (images.length) showImage(0);
  syncViewerAdd();
  $("#viewer").showModal();
}

function bindEvents() {
  $("#search").addEventListener("input", (e) => { state.query = e.target.value; renderGrid(); });
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderGrid(); });
  $("#only-photos").addEventListener("click", (e) => {
    state.onlyPhotos = !state.onlyPhotos;
    e.currentTarget.setAttribute("aria-pressed", state.onlyPhotos);
    renderGrid();
  });
  $("#categories").addEventListener("scroll", updateChipFade, { passive: true });
  window.addEventListener("resize", updateChipFade);
  // Chips toggle on and off so several categories can be combined; "Todo" clears them.
  $("#categories").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const key = chip.dataset.category;
    const next = new Set(state.categories);
    if (!key) next.clear();
    else if (next.has(key)) next.delete(key);
    else next.add(key);
    setCategories(next);
    chip.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  });
  $("#grid").addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) return toggleInOrder(add.dataset.add);
    const card = e.target.closest(".card");
    if (card) openViewer(state.products.find((p) => p.id === card.dataset.id));
  });

  const viewer = $("#viewer");
  $("#viewer-close").addEventListener("click", () => viewer.close());
  viewer.addEventListener("click", (e) => {
    if (e.target === viewer) return viewer.close();
    if (e.target.closest(".gallery-nav.prev")) showImage(current.index - 1);
    if (e.target.closest(".gallery-nav.next")) showImage(current.index + 1);
    const thumb = e.target.closest("#thumbs button");
    if (thumb) showImage(Number(thumb.dataset.index));
  });
  viewer.addEventListener("keydown", (e) => {
    if (!current.product?.images.length) return;
    if (e.key === "ArrowLeft") showImage(current.index - 1);
    if (e.key === "ArrowRight") showImage(current.index + 1);
  });
  let touchX = null;
  $("#gallery").addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  $("#gallery").addEventListener("touchend", (e) => {
    if (touchX === null || (current.product?.images.length || 0) < 2) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) showImage(current.index + (dx < 0 ? 1 : -1));
    touchX = null;
  });
}

async function init() {
  fillStoreInfo();
  bindEvents();
  bindOrder();
  saveOrder();
  $("#grid").innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton"></div>').join("");
  try {
    state.products = await loadProducts();
    reconcileOrder();
    renderFilters();
    renderGrid();
  } catch (err) {
    console.error(err);
    $("#grid").innerHTML = '<div class="error-box" style="grid-column:1/-1">No pudimos cargar el catálogo. Intenta de nuevo en unos minutos.</div>';
  }
}

init();
