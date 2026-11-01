// Paste into a Facebook photo-viewer tab (…/photo/?fbid=…&set=pb.<profileId>.-2207520000) after the
// bridge window is open (window.__bridge = window.open("http://localhost:5199/bridge", "fbbridge") from a
// real click). Walks "Foto siguiente" through every photo of the profile and sends each full-size image
// plus metadata to scripts/fb_receiver.mjs. Progress: window.__h. Stop: window.__h.stop = true.
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const biggest = () => [...document.querySelectorAll("img")].filter((i) => i.src.includes("fbcdn"))
    .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)[0];
  const fbidNow = () => new URL(location.href).searchParams.get("fbid");
  async function waitFor(fn, ms) {
    const t = Date.now();
    while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(150); }
    return null;
  }
  const pending = new Map();
  addEventListener("message", (e) => {
    if (e.origin === "http://localhost:5199" && e.data?.ack) pending.get(e.data.ack)?.(e.data.ok);
  });
  const send = (prefix, meta, data) => new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(meta.fbid); resolve(false); }, 20000);
    pending.set(meta.fbid, (ok) => { clearTimeout(timer); pending.delete(meta.fbid); resolve(ok); });
    window.__bridge.postMessage({ prefix, meta, data }, "http://localhost:5199", [data]);
  });

  window.__harvest = async function (prefix, max = 6000) {
    const H = window.__h = { prefix, count: 0, errors: [], seen: new Set(), done: false, stop: false, last: null };
    let prevSrc = null;
    while (!H.stop && H.count < max) {
      const fbid = fbidNow();
      if (!fbid || H.seen.has(fbid)) break;
      H.seen.add(fbid);
      try {
        const img = await waitFor(() => {
          const b = biggest();
          return b && b.complete && b.naturalWidth > 200 && b.src !== prevSrc ? b : null;
        }, 12000);
        if (!img) throw new Error("no image");
        prevSrc = img.src;
        const post = [...document.querySelectorAll("a")].find((a) => /Ver publicación|View post/i.test(a.innerText));
        const side = (document.querySelector('div[role="complementary"]')?.innerText || "").replace(/͏/g, "").slice(0, 400);
        const data = await (await fetch(img.src)).arrayBuffer();
        const meta = { fbid, file: `${fbid}.jpg`, w: img.naturalWidth, h: img.naturalHeight, alt: img.alt, post: post ? post.href : null, side };
        if (!(await send(prefix, meta, data))) throw new Error("not saved");
        H.count++;
        H.last = fbid;
      } catch (err) {
        H.errors.push(`${fbid}: ${err.message}`);
      }
      const next = document.querySelector('[aria-label="Foto siguiente"], [aria-label="Next photo"]');
      if (!next) break;
      next.click();
      if (!(await waitFor(() => fbidNow() !== fbid, 12000))) { H.errors.push(`${fbid}: did not advance`); break; }
      await sleep(600 + Math.random() * 800);
    }
    H.done = true;
  };
})();
