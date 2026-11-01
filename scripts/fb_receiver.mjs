// Local receiver for the in-browser Facebook harvester.
// The harvester opens http://localhost:5199/bridge in a popup and postMessages each photo to it;
// the bridge page POSTs to this server, which writes <out>/<prefix>/<fbid>.jpg and appends meta.jsonl.
// Usage: node scripts/fb_receiver.mjs scraped/fb
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || "scraped/fb");
const PORT = 5199;
const safe = (s) => String(s).replace(/[^\w.-]/g, "");

const BRIDGE = `<!doctype html><meta charset="utf-8"><title>fb bridge</title><body>bridge ready
<script>
let n = 0;
addEventListener("message", async (e) => {
  if (!/^https:\\/\\/www\\.facebook\\.com$/.test(e.origin)) return;
  const { prefix, meta, data } = e.data || {};
  if (!prefix || !meta) return;
  const r = await fetch("/save?prefix=" + encodeURIComponent(prefix) + "&fbid=" + encodeURIComponent(meta.fbid), {
    method: "POST", headers: { "x-meta": encodeURIComponent(JSON.stringify(meta)) }, body: data,
  });
  e.source.postMessage({ ack: meta.fbid, ok: r.ok }, e.origin);
  document.body.textContent = "bridge ready · saved " + (++n);
});
</script>`;

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/bridge") {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(BRIDGE);
  }
  if (url.pathname === "/save" && req.method === "POST") {
    const dir = path.join(root, safe(url.searchParams.get("prefix")));
    fs.mkdirSync(dir, { recursive: true });
    const fbid = safe(url.searchParams.get("fbid"));
    const meta = JSON.parse(decodeURIComponent(req.headers["x-meta"] || "%7B%7D"));
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      if (body.length) fs.writeFileSync(path.join(dir, `${fbid}.jpg`), body);
      fs.appendFileSync(path.join(dir, "meta.jsonl"), JSON.stringify(meta) + "\n");
      res.writeHead(200).end("ok");
    });
    return;
  }
  res.writeHead(404).end();
}).listen(PORT, "127.0.0.1", () => console.log(`receiver on http://localhost:${PORT}, writing to ${root}`));
