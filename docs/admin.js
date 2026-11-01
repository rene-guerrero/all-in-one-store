const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.STORE_CONFIG;
const BUCKET = "product-images";
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;

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
  await loadProducts();
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
    .select("id,name,category,stock,active,hidden,product_images(id,path,sort_order)")
    .order("name");
  if (error) {
    $("#list-info").textContent = `Error: ${error.message}`;
    return;
  }
  state.products = data.filter((p) => p.active).map((p) => ({
    ...p,
    product_images: p.product_images.sort((a, b) => a.sort_order - b.sort_order),
  }));
  renderList();
}

function renderList() {
  const query = fold($("#filter").value).trim();
  const imagesFilter = $("#filter-images").value;
  const list = state.products.filter((p) =>
    (!query || fold(`${p.name} ${p.category}`).includes(query)) &&
    (imagesFilter !== "none" || p.product_images.length === 0) &&
    (imagesFilter !== "some" || p.product_images.length > 0));
  const withImages = state.products.filter((p) => p.product_images.length).length;
  $("#list-info").textContent = `${list.length} mostrados · ${withImages}/${state.products.length} con imágenes`;
  $("#products").innerHTML = list.map((p) => {
    const first = p.product_images[0];
    return `<li><button data-id="${p.id}" aria-current="${p.id === state.selectedId}">
      ${first ? `<img class="mini" src="${escapeHtml(publicUrl(first.path))}" alt="" loading="lazy">` : '<span class="mini"></span>'}
      <span class="meta"><div>${escapeHtml(p.name)}</div><small>${escapeHtml(p.category || "")} · stock ${p.stock}${p.hidden ? " · oculto" : ""}</small></span>
      <span class="tag ${p.product_images.length ? "ok" : ""}">${p.product_images.length} ${p.product_images.length === 1 ? "foto" : "fotos"}</span>
    </button></li>`;
  }).join("");
}

$("#filter").addEventListener("input", renderList);
$("#filter-images").addEventListener("change", renderList);
$("#products").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  openEditor(btn.dataset.id);
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

/* Editor */
const selected = () => state.products.find((p) => p.id === state.selectedId);

function renderEditor() {
  const p = selected();
  if (!p) return;
  const images = p.product_images;
  const hiddenNote = p.hidden ? " · oculto en la tienda" : p.stock > 0 ? "" : " · sin stock, no se muestra en la tienda";
  $("#editor").innerHTML = `
    <button class="btn btn-sm back-btn" id="back" type="button">${ICON.back} Productos</button>
    <div>
      <div class="card-category">${escapeHtml(p.category || "")}</div>
      <h2>${escapeHtml(p.name)}</h2>
      <small class="status">Stock: ${p.stock}${hiddenNote}</small>
    </div>
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
      <strong>${images.length ? `${images.length} ${images.length === 1 ? "foto" : "fotos"}` : "Sin fotos todavía"}</strong>
      ${images.length > 1 ? "<small>La primera es la portada. Usa ◀ ▶ para ordenar.</small>" : ""}
    </div>
    <div class="image-grid">
      ${images.map((img, i) => `
        <div class="image-tile">
          <div class="image-wrap">
            <img src="${escapeHtml(publicUrl(img.path))}" alt="Foto ${i + 1}" loading="lazy">
            ${i === 0 ? '<span class="cover-badge">Portada</span>' : ""}
          </div>
          <div class="actions">
            <button class="icon-btn" data-move="-1" data-image="${img.id}" ${i === 0 ? "disabled" : ""} aria-label="Mover antes">${ICON.left}</button>
            <button class="icon-btn danger" data-delete="${img.id}" aria-label="Eliminar foto">${ICON.trash}</button>
            <button class="icon-btn" data-move="1" data-image="${img.id}" ${i === images.length - 1 ? "disabled" : ""} aria-label="Mover después">${ICON.right}</button>
          </div>
        </div>`).join("")}
    </div>`;

  const dz = $("#dropzone");
  $("#back").addEventListener("click", () => (history.state?.editor ? history.back() : closeEditor()));
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

async function resizeImage(file) {
  const source = await decodeImage(file);
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("No se pudo procesar la imagen");
  return blob;
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
      const blob = await resizeImage(file);
      const path = `${p.id}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (upErr) throw upErr;
      const { data, error: rowErr } = await sb.from("product_images")
        .insert({ product_id: p.id, path, sort_order: ++order })
        .select("id,path,sort_order").single();
      if (rowErr) {
        await sb.storage.from(BUCKET).remove([path]);
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
  await sb.storage.from(BUCKET).remove([img.path]);
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
