"""Upload matched Facebook photos to the store: WebP 1200px + 480px thumb into Supabase Storage,
plus a product_images row each. Skips photos already uploaded (tracked in <dir>/uploaded.json).

Usage: .venv-ocr/Scripts/python -I scripts/fb_upload.py <dir> <assignments.json> [--max-per-product N] [--dry-run]
  assignments.json: {fbid: product_id}
Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (service key bypasses RLS: run locally only).
"""
import io
import json
import os
import sys
import urllib.request
import uuid
from collections import defaultdict
from pathlib import Path

from PIL import Image

BUCKET = "product-images"
FULL = (1200, 80)
THUMB = (480, 75)


def webp(img: Image.Image, side: int, quality: int) -> bytes:
    im = img.copy()
    im.thumbnail((side, side), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
    return buf.getvalue()


def request(method: str, url: str, key: str, body: bytes | None = None, content_type: str = "application/json", extra=None):
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": content_type, **(extra or {})}
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as res:
        data = res.read()
        return json.loads(data) if data and content_type == "application/json" else data


def main() -> None:
    folder, assignments_path = Path(sys.argv[1]), Path(sys.argv[2])
    args = sys.argv[3:]
    max_per = int(args[args.index("--max-per-product") + 1]) if "--max-per-product" in args else 6
    dry = "--dry-run" in args
    url, key = os.environ["SUPABASE_URL"].rstrip("/"), os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    assignments: dict[str, str] = json.loads(assignments_path.read_text("utf-8"))
    done_path = folder / "uploaded.json"
    done: dict[str, str] = json.loads(done_path.read_text("utf-8")) if done_path.exists() else {}
    dates = json.loads((folder / "dates.json").read_text("utf-8"))

    # Newest photos first; at most max_per photos per product (counting ones already in the store).
    existing = request("GET", f"{url}/rest/v1/product_images?select=product_id,sort_order", key)
    count, next_order = defaultdict(int), defaultdict(int)
    for row in existing:
        count[row["product_id"]] += 1
        next_order[row["product_id"]] = max(next_order[row["product_id"]], row["sort_order"] + 1)

    todo = sorted((f for f in assignments if f not in done), key=lambda f: dates.get(f) or "", reverse=True)
    uploaded = skipped = 0
    for fbid in todo:
        product = assignments[fbid]
        if count[product] >= max_per:
            skipped += 1
            continue
        img = Image.open(folder / f"{fbid}.jpg").convert("RGB")
        base = f"{product}/{uuid.uuid4()}"
        path, thumb_path = f"{base}.webp", f"{base}.thumb.webp"
        if not dry:
            for target, (side, q) in ((path, FULL), (thumb_path, THUMB)):
                request("POST", f"{url}/storage/v1/object/{BUCKET}/{target}", key, webp(img, side, q), "image/webp",
                        {"cache-control": "max-age=31536000", "x-upsert": "false"})
            request("POST", f"{url}/rest/v1/product_images", key, json.dumps({
                "product_id": product, "path": path, "thumb_path": thumb_path, "sort_order": next_order[product],
            }).encode(), extra={"Prefer": "return=minimal"})
            done[fbid] = product
            done_path.write_text(json.dumps(done, indent=1), "utf-8")
        count[product] += 1
        next_order[product] += 1
        uploaded += 1
    print(f"{'would upload' if dry else 'uploaded'} {uploaded}, skipped {skipped} (product already has {max_per}), "
          f"{len(assignments) - len(todo)} done earlier; products touched: {len({assignments[f] for f in todo})}")


if __name__ == "__main__":
    main()
