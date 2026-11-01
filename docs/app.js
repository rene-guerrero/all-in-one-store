const { SUPABASE_URL, SUPABASE_ANON_KEY, STORE } = window.STORE_CONFIG;
const IMAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/product-images/`;
const ICONS = {
  photos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m21 16-5-5-8 8"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
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
  $("#footer-address").href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${STORE.address}, Holguín, Cuba`)}`;
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
  return `<button class="card" data-id="${p.id}">
    <div class="card-media">${media}${p.isNew ? '<span class="badge-new">Nuevo</span>' : ""}</div>
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
