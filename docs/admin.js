const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.STORE_CONFIG;
const BUCKET = "product-images";
// Every photo is stored twice: FULL for the product viewer, THUMB for list/grid cards.
const FULL = { side: 1200, quality: 0.8 };
const THUMB = { side: 480, quality: 0.75 };

// Invite and password-reset emails land here with #...&type=invite|recovery; read it before
// supabase-js consumes the hash.
const authLinkType = new URLSearchParams(location.hash.slice(1)).get("type");
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (sel) => document.querySelector(sel);
const fold = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const publicUrl = (path) => sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

const state = { products: [], selectedId: null };

const icon = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  back: icon('<path d="m15 18-6-6 6-6"/>'),
  left: icon('<path d="m15 18-6-6 6-6"/>'),
  right: icon('<path d="m9 18 6-6-6-6"/>'),
  trash: icon('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  camera: icon('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  gallery: icon('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/>'),
};

/* Auth */
async function showForSession(session) {
  $("#login").hidden = !!session;
  $("#logout").hidden = !session;
  $("#app").hidden = true;
  if (!session) return;

  const { data: adminRow } = await sb.from("admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
  $("#who").textContent = session.user.email;
  if (!adminRow) {
    $("#editor").innerHTML = "";
    $("#login").hidden = false;
    $("#login-status").textContent = "Esta cuenta no tiene permisos de administrador.";
    $("#login-status").classList.add("error");
    await sb.auth.signOut();
    return;
  }
  $("#app").hidden = false;
  await Promise.all([loadCategories(), loadProducts()]);
  renderCategories();
}

$("#login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#login-status");
  status.classList.remove("error");
  status.textContent = "Entrando…";
  const { data, error } = await sb.auth.signInWithPassword({ email: $("#email").value, password: $("#password").value });
  if (error) {
    status.textContent = "Correo o contraseña incorrectos.";
    status.classList.add("error");
    return;
  }
  status.textContent = "";
  showForSession(data.session);
});

$("#logout").addEventListener("click", async () => {
  await sb.auth.signOut();
  showForSession(null);
});

$("#forgot").addEventListener("click", async () => {
  const status = $("#login-status");
  const email = $("#email").value.trim();
  status.classList.remove("error");
  if (!email) {
    status.textContent = "Escribe tu correo primero.";
    status.classList.add("error");
    return;
  }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0] });
  status.textContent = error ? error.message : "Te enviamos un correo para crear una nueva contraseña.";
  status.classList.toggle("error", !!error);
});

function showSetPassword() {
  $("#login").hidden = true;
  $("#app").hidden = true;
  $("#set-password").hidden = false;
}

$("#set-password").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#set-password-status");
  const password = $("#new-password").value;
  status.classList.remove("error");
  if (password.length < 8) {
    status.textContent = "Usa al menos 8 caracteres.";
    status.classList.add("error");
    return;
  }
  status.textContent = "Guardando…";
  const { data, error } = await sb.auth.updateUser({ password });
  if (error) {
    status.textContent = error.message;
    status.classList.add("error");
    return;
  }
  $("#set-password").hidden = true;
  history.replaceState(null, "", location.pathname);
  const { data: { session } } = await sb.auth.getSession();
  showForSession(session ?? data.session);
});

/* Product list */
async function loadProducts() {
  const { data, error } = await sb
    .from("products")
    .select(PRODUCT_FIELDS)
    .order("name");
  if (error) {
    $("#list-info").textContent = `Error: ${error.message}`;
    return;
  }
  state.products = data.filter((p) => p.active).map(decorate);
  renderFilterOptions();
  renderList();
}

// Derived fields used by filters; recomputed whenever a product is saved.
function decorate(p) {
  return {
    ...p,
    product_images: (p.product_images || []).sort((a, b) => a.sort_order - b.sort_order),
    brand: brandOf(p.name),
    categoryKey: fold(p.category).trim() || "otros",
  };
}

const brandFilter = createMultiSelect($("#brand-ms"), { label: "Marca", onChange: () => renderList() });
const categoryFilter = createMultiSelect($("#category-ms"), { label: "Categoría", onChange: () => renderList() });

function renderFilterOptions() {
  const categories = {};
  for (const p of state.products) {
    const label = (p.category || "Otros").trim();
    const hasAccent = /[̀-ͯ]/.test(label.normalize("NFD"));
    const entry = (categories[p.categoryKey] ??= { label, count: 0 });
    if (hasAccent) entry.label = label;
    entry.count++;
  }
  categoryFilter.setOptions(Object.entries(categories).sort((a, b) => b[1].count - a[1].count)
    .map(([key, c]) => ({ value: key, label: c.label, count: c.count, icon: categoryIcon(key) })));

  const brands = {};
  for (const p of state.products) if (p.brand) brands[p.brand] = (brands[p.brand] || 0) + 1;
  brandFilter.setOptions(Object.keys(brands).sort().map((b) => ({ value: b, label: b, count: brands[b] })));
}

function renderList() {
  const query = fold($("#filter").value).trim();
  const brands = brandFilter.selected;
  const categories = categoryFilter.selected;
  const imagesFilter = $("#filter-images").value;
  $("#filter-images").classList.toggle("active", !!imagesFilter);
  $('[data-clear="filter-images"]').hidden = !imagesFilter;
  const list = state.products.filter((p) =>
    (!query || fold(`${p.name} ${p.category}`).includes(query)) &&
    (!brands.size || brands.has(p.brand)) &&
    (!categories.size || categories.has(p.categoryKey)) &&
    (imagesFilter !== "none" || p.product_images.length === 0) &&
    (imagesFilter !== "some" || p.product_images.length > 0));
  const withImages = state.products.filter((p) => p.product_images.length).length;
  $("#list-info").textContent = `${list.length} mostrados · ${withImages}/${state.products.length} con imágenes`;
  $("#products").innerHTML = list.map((p) => {
    const first = p.product_images[0];
    return `<li><button data-id="${p.id}" aria-current="${p.id === state.selectedId}">
      ${first ? `<img class="mini" src="${escapeHtml(publicUrl(first.thumb_path || first.path))}" alt="" loading="lazy">` : `<span class="mini mini-icon">${categoryIcon(fold(p.category).trim())}</span>`}
      <span class="meta"><div>${escapeHtml(p.name)}</div><small>${escapeHtml(p.category || "")} · stock ${p.stock}${p.hidden ? " · oculto" : ""}${p.source === "manual" ? " · manual" : ""}</small></span>
      <span class="tag ${p.product_images.length ? "ok" : ""}">${p.product_images.length} ${p.product_images.length === 1 ? "foto" : "fotos"}</span>
    </button></li>`;
  }).join("");
}

$("#filter").addEventListener("input", renderList);
$("#filter-images").addEventListener("change", renderList);
document.querySelectorAll("[data-clear]").forEach((btn) => btn.addEventListener("click", () => {
  $(`#${btn.dataset.clear}`).value = "";
  renderList();
}));
$("#products").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  openEditor(btn.dataset.id);
});
$("#new-product").addEventListener("click", () => {
  state.draft = { id: null, name: "", category: "", stock: 0, description: "", hidden: false, source: "manual", product_images: [] };
  openEditor(NEW_ID);
  $("#product-form [name=name]").focus();
});

/* On phones the list and the editor are separate screens; the back button returns to the list. */
const isNarrow = () => matchMedia("(max-width: 860px)").matches;

function openEditor(id) {
  state.selectedId = id;
  renderList();
  renderEditor();
  $("#admin-layout").classList.add("editing");
  if (isNarrow()) {
    history.pushState({ editor: id }, "");
    window.scrollTo(0, 0);
  }
}

function closeEditor() {
  $("#admin-layout").classList.remove("editing");
  const row = $(`#products button[data-id="${state.selectedId}"]`);
  if (row && isNarrow()) row.scrollIntoView({ block: "center" });
}

window.addEventListener("popstate", closeEditor);

/* Categories: 'feria' ones come from feria-ventas and are read-only (also enforced in the database). */
async function loadCategories() {
  const { data, error } = await sb.from("categories").select("id,name,source,icon").order("name");
  if (error) {
    $("#category-status").textContent = `Error: ${error.message}`;
    return;
  }
  state.categories = data;
  setCategoryIconChoices(data);
}

/* Icon picker: one icon per category, chosen from ICON_LIBRARY (catalog.js). */
let iconPicked = null;
function pickIcon(current) {
  return new Promise((resolve) => {
    const dialog = $("#icon-picker");
    const render = () => {
      const q = fold($("#icon-search").value).trim();
      $("#icon-grid").innerHTML = ICON_LIBRARY
        .filter((i) => !q || fold(`${i.label} ${i.key}`).includes(q))
        .map((i) => `<button type="button" data-icon="${i.key}" aria-pressed="${i.key === current}" title="${escapeHtml(i.label)}">${i.icon}<span>${escapeHtml(i.label)}</span></button>`)
        .join("") || '<p class="status">Sin resultados.</p>';
    };
    iconPicked = (key) => { iconPicked = null; dialog.close(); resolve(key); };
    $("#icon-search").value = "";
    render();
    $("#icon-search").oninput = render;
    dialog.onclose = () => { if (iconPicked) { iconPicked = null; resolve(null); } };
    dialog.showModal();
  });
}
$("#icon-grid").addEventListener("click", (e) => {
  const b = e.target.closest("[data-icon]");
  if (b && iconPicked) iconPicked(b.dataset.icon);
});
$("#icon-picker-close").addEventListener("click", () => $("#icon-picker").close());

function showNewCategoryIcon() {
  const btn = $("#new-category-icon");
  btn.innerHTML = ICONS_BY_KEY[btn.dataset.icon] || DEFAULT_CATEGORY_ICON;
}
showNewCategoryIcon();
$("#new-category-icon").addEventListener("click", async () => {
  const key = await pickIcon($("#new-category-icon").dataset.icon);
  if (!key) return;
  $("#new-category-icon").dataset.icon = key;
  showNewCategoryIcon();
});

function categoryOptionsHtml(current) {
  const names = (state.categories || []).map((c) => c.name);
  // Keep a product's current value selectable even if it isn't in the list (e.g. renamed source data).
  if (current && !names.some((n) => fold(n).trim() === fold(current).trim())) names.unshift(current);
  const selected = (n) => current && fold(n).trim() === fold(current).trim() ? "selected" : "";
  return '<option value="">Sin categoría</option>' +
    names.map((n) => `<option value="${escapeHtml(n)}" ${selected(n)}>${escapeHtml(n)}</option>`).join("");
}

function renderCategories() {
  const counts = {};
  for (const p of state.products) counts[p.categoryKey] = (counts[p.categoryKey] || 0) + 1;
  $("#category-list").innerHTML = (state.categories || []).map((c) => {
    const key = fold(c.name).trim();
    const count = counts[key] || 0;
    const readOnly = c.source === "feria";
    return `<li data-category-id="${c.id}">
      ${readOnly
        ? `<span class="mini mini-icon">${categoryIcon(key)}</span>`
        : `<button type="button" class="mini mini-icon icon-choice" data-change-icon="${c.id}" aria-label="Cambiar ícono" title="Cambiar ícono">${categoryIcon(key)}</button>`}
      <span class="meta">
        ${readOnly ? `<div>${escapeHtml(c.name)}</div>` : `<input class="category-name" value="${escapeHtml(c.name)}" maxlength="60" aria-label="Nombre de la categoría">`}
        <small>${count} ${count === 1 ? "producto" : "productos"}</small>
      </span>
      ${readOnly
        ? '<span class="tag">SoftCell · solo lectura</span>'
        : `<span class="category-actions">
            <button class="btn btn-sm" type="button" data-rename="${c.id}">Guardar</button>
            <button class="btn btn-sm btn-danger" type="button" data-remove="${c.id}" ${count ? 'title="Tiene productos"' : ""}>Eliminar</button>
          </span>`}
    </li>`;
  }).join("");
}

function setCategoryStatus(message, isError = false) {
  $("#category-status").textContent = message;
  $("#category-status").classList.toggle("error", isError);
}

const friendlyCategoryError = (error) =>
  error.code === "23505" ? "Ya existe una categoría con ese nombre." : error.message;

async function afterCategoryChange() {
  await Promise.all([loadCategories(), loadProducts()]);
  renderCategories();
}

$("#category-add").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#new-category").value.trim();
  if (!name) return;
  const icon = $("#new-category-icon").dataset.icon;
  const { error } = await sb.from("categories").insert({ name, source: "manual", icon });
  if (error) return setCategoryStatus(`No se pudo crear: ${friendlyCategoryError(error)}`, true);
  $("#new-category").value = "";
  $("#new-category-icon").dataset.icon = "otros";
  showNewCategoryIcon();
  await afterCategoryChange();
  setCategoryStatus(`Categoría "${name}" creada.`);
});

$("#category-list").addEventListener("click", async (e) => {
  const rename = e.target.closest("[data-rename]");
  const remove = e.target.closest("[data-remove]");
  const changeIcon = e.target.closest("[data-change-icon]");
  if (changeIcon) {
    const c = state.categories.find((x) => x.id === changeIcon.dataset.changeIcon);
    const icon = await pickIcon(c.icon || "otros");
    if (!icon || icon === c.icon) return;
    const { error } = await sb.from("categories").update({ icon }).eq("id", c.id);
    if (error) return setCategoryStatus(`No se pudo cambiar el ícono: ${error.message}`, true);
    await afterCategoryChange();
    setCategoryStatus(`Ícono de "${c.name}" actualizado.`);
  }
  if (rename) {
    const id = rename.dataset.rename;
    const input = $(`[data-category-id="${id}"] .category-name`);
    const name = input.value.trim();
    if (!name) return setCategoryStatus("El nombre no puede estar vacío.", true);
    const { error } = await sb.from("categories").update({ name }).eq("id", id);
    if (error) return setCategoryStatus(`No se pudo renombrar: ${friendlyCategoryError(error)}`, true);
    await afterCategoryChange();
    setCategoryStatus(`Categoría renombrada a "${name}". Sus productos se actualizaron.`);
  }
  if (remove) {
    const c = state.categories.find((x) => x.id === remove.dataset.remove);
    if (!c || !confirm(`¿Eliminar la categoría "${c.name}"?`)) return;
    const { error } = await sb.from("categories").delete().eq("id", c.id);
    if (error) return setCategoryStatus(error.message, true);
    await afterCategoryChange();
    setCategoryStatus(`Categoría "${c.name}" eliminada.`);
  }
});

document.querySelector(".admin-tabs").addEventListener("click", (e) => {
  const tab = e.target.closest("[data-tab]");
  if (!tab) return;
  document.querySelectorAll(".admin-tabs [data-tab]").forEach((b) => b.setAttribute("aria-pressed", b === tab));
  const showCategories = tab.dataset.tab === "categories";
  $("#categories-panel").hidden = !showCategories;
  $("#admin-layout").hidden = showCategories;
  if (showCategories) renderCategories();
});

/* Editor */
const NEW_ID = "new";
const PRODUCT_FIELDS = "id,name,category,stock,active,hidden,source,description,product_images(id,path,thumb_path,sort_order)";
const selected = () => (state.selectedId === NEW_ID ? state.draft : state.products.find((p) => p.id === state.selectedId));

function productFormHtml(p) {
  const isNew = !p.id;
  const shopNote = p.hidden ? "Oculto en la tienda." : p.stock > 0 ? "" : "Sin stock: no se muestra en la tienda.";
  return `
    <div class="editor-title">
      <div class="card-category">${escapeHtml(isNew ? "Nuevo producto" : p.category || "")}</div>
      <h2>${escapeHtml(isNew ? "Nuevo producto" : p.name)}</h2>
      <span class="tag ${p.source === "manual" ? "" : "ok"}">${p.source === "manual" ? "Creado en All in One" : "De feria-ventas"}</span>
    </div>
    <form class="product-form" id="product-form" novalidate>
      ${p.source === "feria" ? '<p class="sync-note">Nombre, categoría y stock se actualizan cada día desde feria-ventas, así que tus cambios en esos campos se reemplazan en la próxima sincronización. Descripción y visibilidad son solo de All in One.</p>' : ""}
      <label>Nombre<input name="name" required maxlength="120" value="${escapeHtml(p.name)}" autocomplete="off"></label>
      <div class="form-row">
        <label>Categoría<select name="category">${categoryOptionsHtml(p.category)}</select></label>
        <label>Stock<input name="stock" type="number" min="0" step="1" inputmode="numeric" value="${p.stock}"></label>
      </div>
      <label>Descripción<textarea name="description" rows="3" maxlength="1000" placeholder="Opcional: material, colores, compatibilidad…">${escapeHtml(p.description || "")}</textarea></label>
      <label class="check"><input type="checkbox" name="visible" ${p.hidden ? "" : "checked"}> Mostrar en la tienda</label>
      ${shopNote ? `<small class="status">${shopNote}</small>` : ""}
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">${isNew ? "Crear producto" : "Guardar cambios"}</button>
        ${isNew ? "" : '<button class="btn btn-danger" type="button" id="delete-product">Eliminar</button>'}
      </div>
      <div class="status" id="form-status" aria-live="polite"></div>
    </form>`;
}

function renderEditor() {
  const p = selected();
  if (!p) return;
  const images = p.product_images;
  const back = `<button class="btn btn-sm back-btn" id="back" type="button">${ICON.back} Productos</button>`;
  if (!p.id) {
    $("#editor").innerHTML = back + productFormHtml(p) + '<p class="status">Después de crear el producto podrás agregarle fotos.</p>';
    bindEditor();
    return;
  }
  $("#editor").innerHTML = back + productFormHtml(p) + `
    <h3 class="section-title">Fotos</h3>
    <div class="dropzone" id="dropzone">
      <div class="upload-buttons">
        <label class="btn btn-primary upload-btn">${ICON.camera}<span>Tomar foto</span>
          <input type="file" accept="image/*" capture="environment" hidden data-upload>
        </label>
        <label class="btn upload-btn">${ICON.gallery}<span>Galería</span>
          <input type="file" accept="image/*" multiple hidden data-upload>
        </label>
      </div>
      <small class="drop-hint">En computadora también puedes arrastrar fotos aquí.</small>
    </div>
    <ul class="upload-queue" id="upload-queue"></ul>
    <div class="photos-head">
      ${images.length ? "" : `<span class="mini-icon empty-icon">${categoryIcon(fold(p.category).trim())}</span>`}
      <strong>${images.length ? `${images.length} ${images.length === 1 ? "foto" : "fotos"}` : "Sin fotos todavía"}</strong>
      ${images.length > 1 ? "<small>La primera es la portada. Usa ◀ ▶ para ordenar.</small>" : ""}
    </div>
    <div class="image-grid">
      ${images.map((img, i) => `
        <div class="image-tile">
          <div class="image-wrap">
            <img src="${escapeHtml(publicUrl(img.thumb_path || img.path))}" alt="Foto ${i + 1}" loading="lazy">
            ${i === 0 ? '<span class="cover-badge">Portada</span>' : ""}
          </div>
          <div class="actions">
            <button class="icon-btn" data-move="-1" data-image="${img.id}" ${i === 0 ? "disabled" : ""} aria-label="Mover antes">${ICON.left}</button>
            <button class="icon-btn danger" data-delete="${img.id}" aria-label="Eliminar foto">${ICON.trash}</button>
            <button class="icon-btn" data-move="1" data-image="${img.id}" ${i === images.length - 1 ? "disabled" : ""} aria-label="Mover después">${ICON.right}</button>
          </div>
        </div>`).join("")}
    </div>`;

  bindEditor();
  const dz = $("#dropzone");
  dz.querySelectorAll("[data-upload]").forEach((input) => input.addEventListener("change", (e) => {
    uploadFiles([...e.target.files]);
    e.target.value = "";
  }));
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("drag");
    uploadFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
  });
}

function bindEditor() {
  $("#back").addEventListener("click", leaveEditor);
  $("#product-form").addEventListener("submit", (e) => {
    e.preventDefault();
    saveProduct(e.target);
  });
  $("#delete-product")?.addEventListener("click", deleteProduct);
}

function leaveEditor() {
  if (history.state?.editor) history.back();
  else closeEditor();
}

function setFormStatus(message, isError = false) {
  const status = $("#form-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function saveProduct(form) {
  const p = selected();
  const f = new FormData(form);
  const values = {
    name: String(f.get("name")).trim(),
    category: String(f.get("category")).trim() || null,
    stock: Math.max(0, Number.parseInt(f.get("stock"), 10) || 0),
    description: String(f.get("description")).trim() || null,
    hidden: !f.get("visible"),
    updated_at: new Date().toISOString(),
  };
  if (!values.name) {
    setFormStatus("El nombre es obligatorio.", true);
    form.elements.name.focus();
    return;
  }

  setFormStatus("Guardando…");
  const query = p.id
    ? sb.from("products").update(values).eq("id", p.id)
    : sb.from("products").insert({ ...values, source: "manual" });
  const { data, error } = await query.select(PRODUCT_FIELDS).single();
  if (error) {
    // PGRST116: the update matched no row this session may change (signed out, or product gone).
    const reason = error.code === "PGRST116" ? "tu sesión expiró o el producto ya no existe. Recarga la página." : error.message;
    setFormStatus(`No se pudo guardar: ${reason}`, true);
    return;
  }

  const saved = decorate(data);
  if (p.id) state.products = state.products.map((x) => (x.id === saved.id ? saved : x));
  else state.products.push(saved);
  state.products.sort((a, b) => a.name.localeCompare(b.name, "es"));
  state.selectedId = saved.id;
  if (history.state?.editor) history.replaceState({ editor: saved.id }, "");
  renderFilterOptions();
  renderList();
  renderEditor();
  setFormStatus(p.id ? "Cambios guardados." : "Producto creado. Ya puedes agregar fotos.");
}

async function deleteProduct() {
  const p = selected();
  const photos = p.product_images.length;
  const message = p.source === "feria"
    ? `¿Eliminar "${p.name}"?\n\nEste producto viene de feria-ventas: si sigue activo allí, volverá a aparecer en la próxima sincronización (sin fotos ni descripción).\n\nPara quitarlo de la tienda sin que vuelva, mejor desmarca "Mostrar en la tienda".`
    : `¿Eliminar "${p.name}"${photos ? ` y sus ${photos} fotos` : ""}? No se puede deshacer.`;
  if (!confirm(message)) return;

  setFormStatus("Eliminando…");
  const { error } = await sb.from("products").delete().eq("id", p.id);
  if (error) {
    setFormStatus(`No se pudo eliminar: ${error.message}`, true);
    return;
  }
  // Photo rows go with the product (on delete cascade); the files need removing separately.
  if (photos) await sb.storage.from(BUCKET).remove(p.product_images.flatMap((img) => [img.path, img.thumb_path].filter(Boolean)));

  state.products = state.products.filter((x) => x.id !== p.id);
  state.selectedId = null;
  renderFilterOptions();
  renderList();
  $("#editor").innerHTML = '<p class="status">Producto eliminado. Elige otro producto de la lista.</p>';
  leaveEditor();
}

$("#editor").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-delete]");
  const move = e.target.closest("[data-move]");
  if (del) await deleteImage(del.dataset.delete);
  if (move) await moveImage(move.dataset.image, Number(move.dataset.move));
});

// Phones can hand over formats createImageBitmap can't decode (e.g. HEIC outside Safari);
// an <img> element is the fallback decoder.
async function decodeImage(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

async function encode(source, { side, quality }) {
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  const scale = Math.min(1, side / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  // Browsers that can't encode WebP (older Safari) silently return PNG; use JPEG there instead.
  let blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob || blob.type !== "image/webp") blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("No se pudo procesar la imagen");
  return blob;
}

async function resizeImage(file) {
  const source = await decodeImage(file);
  try {
    return { full: await encode(source, FULL), thumb: await encode(source, THUMB) };
  } finally {
    source.close?.();
  }
}

const QUEUE_LABELS = { waiting: "En espera", working: "Subiendo…", done: "Lista", error: "Error" };

async function uploadFiles(files) {
  const p = selected();
  if (!p || !files.length) return;
  const queue = $("#upload-queue");
  const rows = files.map((file) => {
    const li = document.createElement("li");
    li.className = "waiting";
    li.innerHTML = `<img alt=""><span class="name"></span><span class="state">${QUEUE_LABELS.waiting}</span>`;
    li.querySelector("img").src = URL.createObjectURL(file);
    li.querySelector(".name").textContent = file.name || "foto";
    queue.append(li);
    return li;
  });
  const setRow = (li, stateName, message) => {
    li.className = stateName;
    li.querySelector(".state").textContent = message || QUEUE_LABELS[stateName];
  };

  let order = p.product_images.reduce((max, img) => Math.max(max, img.sort_order), -1);
  let failures = 0;
  for (const [i, file] of files.entries()) {
    setRow(rows[i], "working");
    try {
      const { full, thumb } = await resizeImage(file);
      const base = `${p.id}/${crypto.randomUUID()}`;
      const ext = full.type === "image/webp" ? "webp" : "jpg";
      const path = `${base}.${ext}`;
      const thumbPath = `${base}.thumb.${ext}`;
      const options = { contentType: full.type, cacheControl: "31536000" };
      for (const [target, blob] of [[path, full], [thumbPath, thumb]]) {
        const { error: upErr } = await sb.storage.from(BUCKET).upload(target, blob, options);
        if (upErr) {
          await sb.storage.from(BUCKET).remove([path, thumbPath]);
          throw upErr;
        }
      }
      const { data, error: rowErr } = await sb.from("product_images")
        .insert({ product_id: p.id, path, thumb_path: thumbPath, sort_order: ++order })
        .select("id,path,thumb_path,sort_order").single();
      if (rowErr) {
        await sb.storage.from(BUCKET).remove([path, thumbPath]);
        throw rowErr;
      }
      p.product_images.push(data);
      setRow(rows[i], "done");
    } catch (err) {
      failures++;
      setRow(rows[i], "error", `Error: ${err.message}`);
    }
  }
  rows.filter((li) => li.classList.contains("done")).forEach((li) => URL.revokeObjectURL(li.querySelector("img").src));
  renderList();
  // Keep failed rows visible so the admin can see what didn't upload.
  const failedRows = rows.filter((li) => li.classList.contains("error"));
  renderEditor();
  if (failures) $("#upload-queue").append(...failedRows);
}

async function deleteImage(imageId) {
  const p = selected();
  const img = p.product_images.find((x) => x.id === imageId);
  if (!img || !confirm("¿Eliminar esta foto?")) return;
  const { error } = await sb.from("product_images").delete().eq("id", imageId);
  if (error) return alert(error.message);
  await sb.storage.from(BUCKET).remove([img.path, img.thumb_path].filter(Boolean));
  p.product_images = p.product_images.filter((x) => x.id !== imageId);
  renderList();
  renderEditor();
}

async function moveImage(imageId, delta) {
  const images = selected().product_images;
  const i = images.findIndex((x) => x.id === imageId);
  const j = i + delta;
  if (j < 0 || j >= images.length) return;
  [images[i], images[j]] = [images[j], images[i]];
  images.forEach((img, idx) => { img.sort_order = idx; });
  const results = await Promise.all(images.map((img) =>
    sb.from("product_images").update({ sort_order: img.sort_order }).eq("id", img.id)));
  const failed = results.find((r) => r.error);
  if (failed) alert(failed.error.message);
  renderList();
  renderEditor();
}

sb.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") showSetPassword();
});
sb.auth.getSession().then(({ data }) => {
  if (data.session && (authLinkType === "invite" || authLinkType === "recovery")) showSetPassword();
  else showForSession(data.session);
});
