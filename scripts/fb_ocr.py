"""Unpack Facebook photo zips (from the in-browser harvester) and OCR the text printed on each photo.

Usage: .venv-ocr/Scripts/python -I scripts/fb_ocr.py <zip_dir> <prefix> <out_dir>
  e.g. ... scripts/fb_ocr.py %USERPROFILE%/Downloads feria scraped/fb/feria

Writes <out_dir>/<fbid>.jpg, <out_dir>/meta.json (photo metadata) and <out_dir>/ocr.json
({fbid: [{"text", "conf", "y"}]}, y = vertical centre as a fraction of image height).
Already-processed photos are skipped, so it can be re-run while the harvester is still going.
"""
import json
import sys
import zipfile
from pathlib import Path

from PIL import Image
from rapidocr_onnxruntime import RapidOCR

OCR_MAX_SIDE = 1280


def unpack(zip_dir: Path, prefix: str, out: Path) -> dict:
    meta_path = out / "meta.json"
    meta = json.loads(meta_path.read_text("utf-8")) if meta_path.exists() else {}
    # Photos sent through scripts/fb_receiver.mjs land directly in out/ with one JSON line each.
    jsonl = out / "meta.jsonl"
    if jsonl.exists():
        for line in jsonl.read_text("utf-8").splitlines():
            if line.strip():
                m = json.loads(line)
                meta[m["fbid"]] = m
    for zpath in sorted(zip_dir.glob(f"{prefix}-*.zip")):
        try:
            with zipfile.ZipFile(zpath) as z:
                for name in z.namelist():
                    if name.startswith("meta-"):
                        for m in json.loads(z.read(name)):
                            meta[m["fbid"]] = m
                    elif not (out / name).exists():
                        (out / name).write_bytes(z.read(name))
        except zipfile.BadZipFile:
            print(f"skip {zpath.name}: still downloading or corrupt")
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), "utf-8")
    return meta


def main() -> None:
    zip_dir, prefix, out = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    meta = unpack(zip_dir, prefix, out)

    ocr_path = out / "ocr.json"
    results = json.loads(ocr_path.read_text("utf-8")) if ocr_path.exists() else {}
    todo = [fbid for fbid in meta if fbid not in results and (out / f"{fbid}.jpg").exists()]
    print(f"{len(meta)} photos, {len(results)} already read, {len(todo)} to read")

    engine = RapidOCR()
    for i, fbid in enumerate(todo, 1):
        img = Image.open(out / f"{fbid}.jpg").convert("RGB")
        scale = min(1.0, OCR_MAX_SIDE / max(img.size))
        if scale < 1:
            img = img.resize((round(img.width * scale), round(img.height * scale)))
        found, _ = engine(img)
        lines = [
            {"text": text, "conf": round(float(conf), 3), "y": round(sum(p[1] for p in box) / 4 / img.height, 3)}
            for box, text, conf in (found or [])
        ]
        # The model name is usually printed near the bottom; if nothing solid was read there,
        # OCR the bottom band again at twice the size.
        if not any(l["y"] > 0.6 and l["conf"] > 0.8 and len(l["text"]) >= 4 for l in lines):
            top = round(img.height * 0.6)
            band = img.crop((0, top, img.width, img.height))
            band = band.resize((band.width * 2, band.height * 2))
            extra, _ = engine(band)
            for box, text, conf in extra or []:
                y = (top + sum(p[1] for p in box) / 4 / 2) / img.height
                lines.append({"text": text, "conf": round(float(conf), 3), "y": round(y, 3), "pass": 2})
        results[fbid] = lines
        if i % 25 == 0 or i == len(todo):
            ocr_path.write_text(json.dumps(results, ensure_ascii=False, indent=1), "utf-8")
            print(f"read {i}/{len(todo)}", flush=True)


if __name__ == "__main__":
    main()
