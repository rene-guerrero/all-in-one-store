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

// Icons an admin can choose for their own categories (categories.icon stores the key).
const ICON_LIBRARY = [
  ["cover", "Covers", CATEGORY_ICONS.cover], ["micas", "Micas", CATEGORY_ICONS.micas],
  ["pantalla", "Pantallas", svg('<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M8.5 5.5h7v11h-7zM10.5 9.5l3 3"/>')],
  ["telefono", "Teléfonos", svg('<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>')],
  ["tablet", "Tablets", svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M11 18h2"/>')],
  ["laptop", "Laptops", svg('<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2.5 18.5h19"/>')],
  ["monitor", "Computadoras", svg('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>')],
  ["tv", "Televisores", svg('<rect x="2.5" y="5" width="19" height="12" rx="1.5"/><path d="M8 21h8M12 17v4M9 2.5l3 2.5 3-2.5"/>')],
  ["reloj", "Relojes", svg('<rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6l.6-3h4.8l.6 3M9 18l.6 3h4.8l.6-3M12 10v2l1.5 1"/>')],
  ["audifonos", "Audífonos", CATEGORY_ICONS.audifonos],
  ["bocina", "Bocinas", svg('<rect x="6" y="2.5" width="12" height="19" rx="2"/><circle cx="12" cy="14" r="3.5"/><circle cx="12" cy="7" r="1.3"/>')],
  ["microfono", "Micrófonos", svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>')],
  ["camara", "Cámaras", svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>')],
  ["consola", "Videojuegos", svg('<path d="M7 8h10a4 4 0 0 1 4 4v2.5a3 3 0 0 1-5.4 1.8L14.5 15h-5l-1.1 1.3A3 3 0 0 1 3 14.5V12a4 4 0 0 1 4-4z"/><path d="M8 11v3M6.5 12.5h3M15.5 11.5h.01M17.5 13.5h.01"/>')],
  ["teclado", "Teclados", svg('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7 14h10"/>')],
  ["mouse", "Mouse", svg('<rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 3v6"/>')],
  ["impresora", "Impresoras", svg('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="1.5"/><path d="M7 14h10v7H7z"/>')],
  ["router", "Redes / WiFi", svg('<rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 16.5h.01M10 16.5h.01M17 13V9M14.2 6.8a4 4 0 0 1 5.6 0M12.5 4.8a6.5 6.5 0 0 1 9 0"/>')],
  ["usb", "Memorias USB", svg('<rect x="8" y="9" width="8" height="12" rx="1.5"/><path d="M9.5 9V3.5h5V9M11 5.5h.01M13 5.5h.01"/>')],
  ["sd", "Tarjetas de memoria", svg('<path d="M7 3h7l4 4v14H7z"/><path d="M10 3v3M12.5 3v3M15 4.5V6"/>')],
  ["sim", "Tarjetas SIM", svg('<path d="M7 3h7l4 4v14H7z"/><rect x="9.5" y="11" width="6" height="7" rx="1"/>')],
  ["disco", "Discos duros", svg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 14h.01M10 14h7"/>')],
  ["cables", "Cables", CATEGORY_ICONS.cables], ["cargadores", "Cargadores", CATEGORY_ICONS.cargadores],
  ["otg", "Adaptadores", CATEGORY_ICONS.otg], ["powerbank", "Powerbanks", CATEGORY_ICONS.powerbank],
  ["bateria", "Baterías", svg('<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10.5v3M6 10v4M9 10v4M12 10v4"/>')],
  ["regleta", "Regletas", svg('<rect x="2.5" y="9" width="19" height="7" rx="2"/><path d="M7 12v1M10 12v1M14 12v1M17 12v1"/>')],
  ["bombillo", "Iluminación", svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>')],
  ["solar", "Paneles solares", svg('<path d="M4 4h16l-2 10H6z"/><path d="M5 9h14M10 4l-1 10M15 4l-1 10M12 14v4M8 21h8"/>')],
  ["lavadora", "Lavadoras", svg('<rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M4 7h16M7 4.8h.01M10 4.8h.01"/><circle cx="12" cy="14" r="4.5"/>')],
  ["refrigerador", "Refrigeradores", svg('<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M5 10h14M8 6v2M8 13v3"/>')],
  ["aire", "Aires acondicionados", svg('<rect x="2.5" y="4" width="19" height="8" rx="2"/><path d="M5.5 9h13M8 15c0 2-1 3-2 4M12 15v5M16 15c0 2 1 3 2 4"/>')],
  ["ventilador", "Ventiladores", svg('<circle cx="12" cy="10" r="1.5"/><path d="M12 8.5c-1-3 0-5.5 2.5-5.5S17 7 13.4 9.4M13.3 10.8c3 .6 4.8 2.7 3.6 4.9s-4.8.8-5-2.9M10.6 10.6c-2.3 2-5 2.2-6 0s2.5-4 5.2-1.8M12 11.5V21M8 21h8"/>')],
  ["microondas", "Microondas", svg('<rect x="2.5" y="5" width="19" height="14" rx="2"/><rect x="5" y="8" width="10" height="8" rx="1"/><path d="M18 9h.01M18 12h.01M18 15h.01"/>')],
  ["cocina", "Cocinas", svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/><circle cx="8" cy="15" r="2.5"/><circle cx="16" cy="15" r="2.5"/>')],
  ["licuadora", "Licuadoras", svg('<path d="M8 3h9l-1.5 11h-6zM8 7h3M7.5 14h10l1 7h-12zM12.5 17.5h.01"/>')],
  ["plancha", "Planchas", svg('<path d="M3 17h15a3 3 0 0 0 3-3V8.5A2.5 2.5 0 0 0 18.5 6H10a6 6 0 0 0-6 6v5M9 9h8"/>')],
  ["secador", "Secadores", svg('<path d="M14 6a5 5 0 1 0 0 10h6V6z"/><circle cx="14" cy="11" r="2"/><path d="M9 15.5L7 21h3l1.5-5"/>')],
  ["ropa", "Ropa", svg('<path d="M8 3L3 6l2 4 2.5-1v12h9V9l2.5 1 2-4-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z"/>')],
  ["pantalon", "Pantalones", svg('<path d="M7 3h10l1 18h-4l-2-11-2 11H6zM7 6h10"/>')],
  ["zapatos", "Zapatos", svg('<path d="M3 16v-5l4-1 3 3 6 1.5c2.5.6 5 1.5 5 3.5v1H3zM3 18.5h18"/>')],
  ["gorra", "Gorras", svg('<path d="M4 15a8 8 0 0 1 16 0zM12 7v1M20 15c1.5 0 2 1 1.5 2H12"/>')],
  ["mochila", "Mochilas", svg('<path d="M6 9a6 6 0 0 1 12 0v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2zM9 5V3.5h6V5M9 14h6v4H9z"/>')],
  ["gafas", "Gafas", svg('<circle cx="6.5" cy="14" r="3.5"/><circle cx="17.5" cy="14" r="3.5"/><path d="M10 14h4M3 13l1.5-6M21 13l-1.5-6"/>')],
  ["perfume", "Belleza", svg('<rect x="6" y="9" width="12" height="12" rx="2"/><path d="M10 9V6h4v3M12 6V3M9 3h3"/>')],
  ["juguete", "Juguetes", svg('<circle cx="12" cy="13" r="6"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="7" r="2"/><path d="M10 12h.01M14 12h.01M10.5 15.5c.8.7 2.2.7 3 0"/>')],
  ["regalo", "Regalos", svg('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8C10.5 4 6 4 7 6.5S12 8 12 8zM12 8c1.5-4 6-4 5-1.5S12 8 12 8z"/>')],
  ["reparacion", "Reparaciones", svg('<path d="M14 7a4 4 0 1 0-5 5l-6 6 3 3 6-6a4 4 0 0 0 5-5l-2.5 2.5-2-2z"/>')],
  ["hogar", "Hogar", svg('<path d="M3 11l9-7 9 7v10H3z"/><path d="M9 21v-6h6v6"/>')],
  ["carro", "Autos", svg('<path d="M5 17H3v-5l2-5h11l3 5h2v5h-2M9.5 17h5M5 12h14"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>')],
  ["bicicleta", "Bicicletas", svg('<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h6l2 7M10 9l3 7H6M14 6h2"/>')],
  ["oferta", "Ofertas", svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>')],
  ["ventosas", "Soportes", CATEGORY_ICONS.ventosas], ["popsocket", "PopSockets", CATEGORY_ICONS.popsocket],
  ["otros", "Otros", DEFAULT_CATEGORY_ICON],
].map(([key, label, icon]) => ({ key, label, icon }));
const ICONS_BY_KEY = Object.fromEntries(ICON_LIBRARY.map((i) => [i.key, i.icon]));

// Icons admins picked for their categories, keyed by folded category name; filled from the categories table.
const CATEGORY_ICON_CHOICES = {};
function setCategoryIconChoices(categories) {
  for (const c of categories) {
    const key = (c.name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    if (c.icon && ICONS_BY_KEY[c.icon]) CATEGORY_ICON_CHOICES[key] = c.icon;
    else delete CATEGORY_ICON_CHOICES[key];
  }
}
const categoryIcon = (key) => ICONS_BY_KEY[CATEGORY_ICON_CHOICES[key]] || CATEGORY_ICONS[key] || DEFAULT_CATEGORY_ICON;
