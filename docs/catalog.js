// Catalog helpers shared by the store and the admin page.

const KNOWN_BRANDS = {
  samsung: "Samsung", redmi: "Xiaomi / Redmi", xiaomi: "Xiaomi / Redmi", poco: "Xiaomi / Redmi",
  iphone: "iPhone", tecno: "Tecno", moto: "Motorola", motorola: "Motorola", alcatel: "Alcatel",
  honor: "Honor", huawei: "Huawei", zte: "ZTE", infinix: "Infinix", oppo: "Oppo", realme: "Realme",
  vivo: "Vivo", nokia: "Nokia", google: "Google Pixel", pixel: "Google Pixel", itel: "Itel",
};

// Brand is read from the first word of the product name; accessories have none.
function brandOf(name) {
  return KNOWN_BRANDS[(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[\s/]+/)[0]] || "";
}

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
