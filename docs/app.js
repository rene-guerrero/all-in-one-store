const { SUPABASE_URL, SUPABASE_ANON_KEY, STORE } = window.STORE_CONFIG;
const IMAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/product-images/`;
const KNOWN_BRANDS = {
  samsung: "Samsung", redmi: "Xiaomi / Redmi", xiaomi: "Xiaomi / Redmi", poco: "Xiaomi / Redmi",
  iphone: "iPhone", tecno: "Tecno", moto: "Motorola", motorola: "Motorola", alcatel: "Alcatel",
  honor: "Honor", huawei: "Huawei", zte: "ZTE", infinix: "Infinix", oppo: "Oppo", realme: "Realme",
  vivo: "Vivo", nokia: "Nokia", google: "Google Pixel", pixel: "Google Pixel", itel: "Itel",
};

const ICONS = {
  photos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m21 16-5-5-8 8"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
};

// Keyed by the accent-free, lowercase category name.
const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const CATEGORY_ICONS = {
  cover: svg('<rect x="6" y="2.5" width="12" height="19" rx="3"/><rect x="8.5" y="5" width="4" height="5" rx="1.3"/>'),
  micas: svg('<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M9 10l4-4M9 15l6-6"/>'),
  cables: svg('<path d="M7 3v3M11 3v3M5.5 6h7v3.5a3.5 3.5 0 0 1-7 0zM9 13v3a4 4 0 0 0 8 0V8a2 2 0 0 1 4 0"/>'),
  cargadores: svg('<rect x="5" y="7" width="14" height="14" rx="3"/><path d="M9 3v4M15 3v4M12.5 10l-2 3.5h3l-2 3.5"/>'),
  otg: svg('<path d="M12 2.5V17M12 13l-4-2.5V7.5M12 11.5l4-2V6.5"/><circle cx="12" cy="19" r="2.3"/><circle cx="8" cy="6.3" r="1.2"/><path d="M15 4.5h2v2h-2z"/>'),
  audifonos: svg('<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4.5" height="7" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="7" rx="1.5"/>'),
  ventosas: svg('<path d="M12 3v8M4.5 20c0-5 3.3-8.5 7.5-8.5s7.5 3.5 7.5 8.5z"/>'),
  popsocket: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/>'),
  powerbank: svg('<rect x="2.5" y="7" width="16.5" height="10" rx="2"/><path d="M21.5 10.5v3M11.5 9l-2 3h3l-2 3"/>'),
};
const DEFAULT_CATEGORY_ICON = svg('<path d="M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8"/>');
const categoryIcon = (key) => CATEGORY_ICONS[key] || DEFAULT_CATEGORY_ICON;
const ALL_ICON = svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>');

const state = { products: [], category: "", brand: "", query: "" };
const $ = (sel) => document.querySelector(sel);

const fold = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const whatsappLink = (text) => `https://wa.me/${STORE.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

function brandOf(name) {
  return KNOWN_BRANDS[fold(name).split(/[\s/]+/)[0]] || "";
}

function fillStoreInfo() {
  document.querySelectorAll("[data-store]").forEach((el) => { el.textContent = STORE[el.dataset.store] || ""; });
  $("#header-whatsapp").href = whatsappLink(`Hola, vengo del catálogo de ${STORE.name}.`);
  $("#footer-facebook").href = STORE.facebook;
  $("#footer-phone").href = `tel:+${STORE.whatsapp}`;
  $("#footer-phone").textContent = STORE.phone;
}

async function loadProducts() {
  const params = new URLSearchParams({
    select: "id,name,category,stock,product_images(path,sort_order)",
    active: "eq.true",
    stock: "gt.0",
    order: "name.asc",
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?${params}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();

  // "Audifonos" and "Audífonos" are the same category; keep the accented spelling.
  const categoryLabels = {};
  for (const p of rows) {
    const key = fold(p.category) || "otros";
    const label = (p.category || "Otros").trim();
    const hasAccent = /[̀-ͯ]/.test(label.normalize("NFD"));
    if (!categoryLabels[key] || hasAccent) categoryLabels[key] = label;
  }

  return rows.map((p) => {
    const images = (p.product_images || []).sort((a, b) => a.sort_order - b.sort_order).map((i) => IMAGE_BASE + i.path);
    const categoryKey = fold(p.category) || "otros";
    return {
      ...p,
      images,
      categoryKey,
      categoryLabel: categoryLabels[categoryKey],
      brand: brandOf(p.name),
      search: fold(`${p.name} ${p.category}`),
    };
  }).sort((a, b) => (b.images.length > 0) - (a.images.length > 0) || a.name.localeCompare(b.name, "es"));
}

function renderFilters() {
  const counts = {};
  const labels = {};
  for (const p of state.products) {
    counts[p.categoryKey] = (counts[p.categoryKey] || 0) + 1;
    labels[p.categoryKey] = p.categoryLabel;
  }
  const keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const chip = (key, icon, label, count) =>
    `<button class="chip" data-category="${escapeHtml(key)}" aria-pressed="${state.category === key}">${icon}${escapeHtml(label)}<span class="count">${count}</span></button>`;
  $("#categories").innerHTML = chip("", ALL_ICON, "Todo", state.products.length) +
    keys.map((k) => chip(k, categoryIcon(k), labels[k], counts[k])).join("");
  updateChipFade();

  $("#category").innerHTML = `<option value="">Categorías (${state.products.length})</option>` +
    keys.map((k) => `<option value="${escapeHtml(k)}" ${k === state.category ? "selected" : ""}>${escapeHtml(labels[k])} (${counts[k]})</option>`).join("");

  const brands =[...new Set(state.products.map((p) => p.brand).filter(Boolean))].sort();
  $("#brand").innerHTML = '<option value="">Marca</option>' +
    brands.map((b) => `<option ${b === state.brand ? "selected" : ""}>${escapeHtml(b)}</option>`).join("");
}

// Category chips (desktop) and the category dropdown (phones) stay in sync.
function setCategory(key) {
  state.category = key;
  $("#categories").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c.dataset.category === key));
  $("#category").value = key;
  $("#category-chip").classList.toggle("active", !!key);
  renderGrid();
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
    (!state.category || p.categoryKey === state.category) &&
    (!state.brand || p.brand === state.brand) &&
    terms.every((t) => p.search.includes(t)));
}

function cardHtml(p) {
  const media = p.images.length
    ? `<img src="${escapeHtml(p.images[0])}" alt="${escapeHtml(p.name)}" loading="lazy">` +
      (p.images.length > 1 ? `<span class="photo-count">${ICONS.photos}${p.images.length}</span>` : "")
    : `<div class="placeholder">${categoryIcon(p.categoryKey)}</div>`;
  return `<button class="card" data-id="${p.id}">
    <div class="card-media">${media}</div>
    <div class="card-body">
      <span class="card-category">${categoryIcon(p.categoryKey)}${escapeHtml(p.categoryLabel)}</span>
      <span class="card-name">${escapeHtml(p.name)}</span>
      ${p.stock <= 2 ? '<span class="badge-low">Últimas unidades</span>' : ""}
    </div>
  </button>`;
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
  $("#viewer-category").innerHTML = categoryIcon(product.categoryKey) + escapeHtml(product.categoryLabel);
  $("#viewer-whatsapp").href = whatsappLink(`Hola, me interesa: ${product.name}. ¿Precio y disponibilidad?`);
  $("#gallery").innerHTML = images.length
    ? `<img alt="${escapeHtml(product.name)}">` + (images.length > 1
      ? `<button class="gallery-nav prev" aria-label="Foto anterior">${ICONS.prev}</button><button class="gallery-nav next" aria-label="Foto siguiente">${ICONS.next}</button>`
      : "")
    : `<div class="placeholder">${categoryIcon(product.categoryKey)}</div>`;
  $("#thumbs").innerHTML = images.length > 1
    ? images.map((src, i) => `<button data-index="${i}" aria-label="Foto ${i + 1}"><img src="${escapeHtml(src)}" alt="" loading="lazy"></button>`).join("")
    : "";
  $("#thumbs").hidden = images.length < 2;
  if (images.length) showImage(0);
  $("#viewer").showModal();
}

function bindEvents() {
  $("#search").addEventListener("input", (e) => { state.query = e.target.value; renderGrid(); });
  $("#brand").addEventListener("change", (e) => {
    state.brand = e.target.value;
    $("#brand-chip").classList.toggle("active", !!state.brand);
    renderGrid();
  });
  $("#categories").addEventListener("scroll", updateChipFade, { passive: true });
  window.addEventListener("resize", updateChipFade);
  $("#category").addEventListener("change", (e) => setCategory(e.target.value));
  $("#categories").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    setCategory(chip.dataset.category);
    chip.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  });
  $("#grid").addEventListener("click", (e) => {
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
  $("#grid").innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton"></div>').join("");
  try {
    state.products = await loadProducts();
    renderFilters();
    renderGrid();
  } catch (err) {
    console.error(err);
    $("#grid").innerHTML = '<div class="error-box" style="grid-column:1/-1">No pudimos cargar el catálogo. Intenta de nuevo en unos minutos.</div>';
  }
}

init();
