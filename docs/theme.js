// Light/dark theme. Loaded in <head> so the saved theme applies before the page paints.
// No saved choice means the page follows the device setting.
(() => {
  const KEY = "store-theme";
  const root = document.documentElement;
  const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const save = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };

  const saved = read();
  if (saved === "light" || saved === "dark") root.dataset.theme = saved;

  const isDark = () => root.dataset.theme
    ? root.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;

  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-theme-toggle]")) return;
    const next = isDark() ? "light" : "dark";
    root.dataset.theme = next;
    save(next);
  });
})();
