// Multi-select filter dropdown shared by the store and the admin page.
// A button ("Marca", "Samsung", "Samsung +2") opens a checklist panel (a bottom sheet on phones);
// the ✕ next to it clears the selection. onChange receives a Set of selected values after every change.
function createMultiSelect(root, { label, onChange }) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let options = [];
  let selected = new Set();

  root.classList.add("ms");
  root.innerHTML = `
    <button type="button" class="ms-button" aria-haspopup="true" aria-expanded="false">
      <span class="ms-label"></span>
      <svg class="ms-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    <button type="button" class="chip-clear ms-clear" aria-label="Quitar filtro de ${esc(label.toLowerCase())}" hidden>✕</button>
    <div class="ms-backdrop" hidden></div>
    <div class="ms-panel" role="dialog" aria-label="${esc(label)}" hidden>
      <div class="ms-head"><strong>${esc(label)}</strong><small class="ms-count"></small></div>
      <ul class="ms-options"></ul>
      <div class="ms-foot">
        <button type="button" class="btn ms-reset">Limpiar</button>
        <button type="button" class="btn btn-primary ms-done">Listo</button>
      </div>
    </div>`;
  // The panel and backdrop live in <body>: an ancestor with backdrop-filter (the sticky toolbar)
  // would otherwise trap position:fixed and the phone bottom sheet would open inside it.
  const panel = root.querySelector(".ms-panel");
  const backdrop = root.querySelector(".ms-backdrop");
  document.body.append(backdrop, panel);
  const $ = (sel) => root.querySelector(sel) || panel.querySelector(sel);
  const button = $(".ms-button");

  function renderButton() {
    const names = options.filter((o) => selected.has(o.value)).map((o) => o.label);
    $(".ms-label").textContent = names.length === 0 ? label : names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
    root.classList.toggle("active", names.length > 0);
    $(".ms-clear").hidden = names.length === 0;
    $(".ms-count").textContent = names.length ? `${names.length} seleccionadas` : "";
  }

  function renderOptions() {
    $(".ms-options").innerHTML = options.map((o) => `
      <li><label>
        <input type="checkbox" value="${esc(o.value)}" ${selected.has(o.value) ? "checked" : ""}>
        ${o.icon || ""}<span class="ms-option-label">${esc(o.label)}</span>
        ${o.count != null ? `<span class="ms-option-count">${o.count}</span>` : ""}
      </label></li>`).join("");
  }

  function emit() {
    renderButton();
    onChange(new Set(selected));
  }

  function place() {
    // Desktop: drop down under the button. Phones: CSS turns the panel into a bottom sheet.
    const r = button.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(r.left, innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${r.bottom + 6}px`;
    panel.style.minWidth = `${r.width}px`;
  }

  function open() {
    document.querySelectorAll(".ms").forEach((other) => other !== root && other.__ms?.close());
    renderOptions();
    panel.hidden = false;
    backdrop.hidden = false;
    place();
    button.setAttribute("aria-expanded", "true");
  }

  function close() {
    panel.hidden = true;
    backdrop.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  button.addEventListener("click", () => (panel.hidden ? open() : close()));
  addEventListener("resize", () => { if (!panel.hidden) place(); });
  addEventListener("scroll", () => { if (!panel.hidden) place(); }, { passive: true });
  const clearAll = () => {
    selected.clear();
    panel.querySelectorAll(".ms-options input").forEach((input) => { input.checked = false; });
    emit();
  };
  $(".ms-clear").addEventListener("click", clearAll);
  $(".ms-reset").addEventListener("click", clearAll);
  $(".ms-done").addEventListener("click", close);
  backdrop.addEventListener("click", close);
  $(".ms-options").addEventListener("change", (e) => {
    if (e.target.checked) selected.add(e.target.value);
    else selected.delete(e.target.value);
    emit();
  });
  document.addEventListener("click", (e) => { if (!root.contains(e.target) && !panel.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  const api = {
    get selected() { return new Set(selected); },
    // Options: [{ value, label, count?, icon? }]. Selected values that no longer exist are dropped.
    setOptions(next) {
      options = next;
      selected = new Set([...selected].filter((v) => options.some((o) => o.value === v)));
      renderOptions();
      renderButton();
    },
    setSelected(values) {
      selected = new Set(values);
      // Only update checkmarks: re-rendering would reset the list's scroll position mid-selection.
      panel.querySelectorAll(".ms-options input").forEach((input) => { input.checked = selected.has(input.value); });
      renderButton();
    },
    close,
  };
  root.__ms = api;
  renderButton();
  return api;
}
