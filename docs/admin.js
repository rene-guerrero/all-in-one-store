const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.STORE_CONFIG;
const BUCKET = "product-images";
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (sel) => document.querySelector(sel);
const fold = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const publicUrl = (path) => sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

const state = { products: [], selectedId: null };

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

/* Product list */
async function loadProducts() {
  const { data, error } = await sb
    .from("products")
    .select("id,name,category,stock,active,product_images(id,path,sort_order)")
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
      <span class="meta"><div>${escapeHtml(p.name)}</div><small>${escapeHtml(p.category || "")} · stock ${p.stock}</small></span>
      <span class="tag ${p.product_images.length ? "ok" : ""}">${p.product_images.length} img</span>
    </button></li>`;
  }).join("");
}

$("#filter").addEventListener("input", renderList);
$("#filter-images").addEventListener("change", renderList);
$("#products").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  state.selectedId = btn.dataset.id;
  renderList();
  renderEditor();
});

/* Editor */
const selected = () => state.products.find((p) => p.id === state.selectedId);

function renderEditor() {
  const p = selected();
  if (!p) return;
  const images = p.product_images;
  $("#editor").innerHTML = `
    <div>
      <div class="card-category">${escapeHtml(p.category || "")}</div>
      <h2>${escapeHtml(p.name)}</h2>
      <small class="status">Stock: ${p.stock}${p.stock > 0 ? "" : " · no se muestra en la tienda"}</small>
    </div>
    <label class="dropzone" id="dropzone">
      <input type="file" id="files" accept="image/*" multiple hidden>
      <strong>Arrastra fotos aquí</strong> o haz clic para elegir.<br>
      <small>Se reducen a ${MAX_SIDE}px antes de subir. La primera foto es la portada.</small>
    </label>
    <div class="status" id="upload-status"></div>
    <div class="image-grid">
      ${images.map((img, i) => `
        <div class="image-tile">
          <img src="${escapeHtml(publicUrl(img.path))}" alt="Foto ${i + 1}" loading="lazy">
          <div class="actions">
            <button class="btn btn-sm" data-move="-1" data-image="${img.id}" ${i === 0 ? "disabled" : ""} aria-label="Mover antes">←</button>
            <button class="btn btn-sm btn-danger" data-delete="${img.id}">Eliminar</button>
            <button class="btn btn-sm" data-move="1" data-image="${img.id}" ${i === images.length - 1 ? "disabled" : ""} aria-label="Mover después">→</button>
          </div>
        </div>`).join("")}
    </div>`;

  const dz = $("#dropzone");
  $("#files").addEventListener("change", (e) => uploadFiles([...e.target.files]));
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

async function resizeImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
}

async function uploadFiles(files) {
  const p = selected();
  if (!p || !files.length) return;
  const status = $("#upload-status");
  status.classList.remove("error");
  let order = p.product_images.reduce((max, img) => Math.max(max, img.sort_order), -1);

  for (const [i, file] of files.entries()) {
    status.textContent = `Subiendo ${i + 1} de ${files.length}…`;
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
    } catch (err) {
      status.textContent = `Error con ${file.name}: ${err.message}`;
      status.classList.add("error");
      break;
    }
  }
  renderList();
  renderEditor();
  if (!$("#upload-status").classList.contains("error")) $("#upload-status").textContent = "Listo.";
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

sb.auth.getSession().then(({ data }) => showForSession(data.session));
