"""Match OCR'd Facebook photos to catalog products by phone model.

Usage: python -I scripts/fb_match.py scraped/catalog.json scraped/fb/feria
Writes <dir>/matches.json: {fbid: {"models": [...], "candidates": [product ids], "styles": [...]}} and prints a summary.
A photo with exactly one candidate is a confident match; several candidates means the model is sold in
several cover styles and the style has to be decided by looking at the photo.
"""
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

BRANDS = {
    "samsung": "samsung", "redmi": "redmi", "xiaomi": "redmi", "poco": "poco", "iphone": "iphone",
    "tecno": "tecno", "moto": "moto", "motorola": "moto", "alcatel": "alcatel", "honor": "honor",
    "huawei": "huawei", "zte": "zte", "realme": "realme", "lg": "lg", "infinix": "infinix", "itel": "itel",
}
STYLE_WORDS = {
    "doble", "dobles", "triple", "robotico", "st", "silicona", "3d", "cordon", "ps", "t", "carga",
    "diseno", "tematico", "transp", "perlado", "perlados",
}


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


def model_keys(text: str) -> set[str]:
    """'Samsung A13 4G/A23/A32 5G' -> {'samsunga13', 'samsunga23', 'samsunga32'} (4G/5G dropped)."""
    t = fold(text).replace("pro max", "promax").replace(" pm", " promax").replace("+", "plus")
    t = re.sub(r"[^a-z0-9/ ]", " ", t)
    keys, brand, prefix = set(), None, ""
    for part in t.split("/"):
        # 4G/5G variants share covers; strip it whether written "A13 4G" or "A134G".
        compact = re.sub(r"(?<=\d)\s*[45]g\b", "", part).replace(" ", "")
        if not compact:
            continue
        found = next((b for b in BRANDS if compact.startswith(b)), None)
        if found:
            brand = BRANDS[found]
            rest = compact[len(found):]
            # Keep series words so 'Redmi Note 10' and 'Tecno Spark Go 2024' don't collide with 'Redmi 10'.
            m = re.match(r"(note|sparkgo|spark|play|stylus|edge|pop)?", rest)
            prefix = brand + (m.group(1) or "")
            keys.add(brand + rest)
        elif brand:
            # Bare follow-ups like 'A23' or '20C' inherit the brand (and series) of the first model.
            keys.add((prefix if not compact[0].isalpha() or prefix == brand else brand) + compact)
            keys.add(brand + compact)
    return {k for k in keys if re.search(r"\d", k)}


def split_style(name: str) -> tuple[str, str]:
    words = name.replace("-", " ").split()
    style = []
    while len(words) > 1 and fold(words[-1]) in STYLE_WORDS:
        style.insert(0, words.pop())
    return " ".join(words), " ".join(style)


def main() -> None:
    catalog = json.loads(Path(sys.argv[1]).read_text("utf-8"))
    folder = Path(sys.argv[2])
    ocr = json.loads((folder / "ocr.json").read_text("utf-8"))

    index: dict[str, list[dict]] = {}
    for p in catalog:
        if not re.search(r"cover|micas", fold(p.get("category") or "")):
            continue
        model, style = split_style(p["name"])
        for key in model_keys(model):
            index.setdefault(key, []).append({"id": p["id"], "name": p["name"], "style": style, "category": p["category"]})

    matches, outcome = {}, Counter()
    for fbid, lines in ocr.items():
        texts = [l["text"] for l in lines if l["conf"] >= 0.8 and len(l["text"]) >= 3]
        keys = set().union(*(model_keys(t) for t in texts)) if texts else set()
        found = {c["id"]: c for k in keys for c in index.get(k, [])}
        # Photos show covers; a 'Micas' product only matches when the photo itself says 'mica'.
        if not any("mica" in fold(t) for t in texts):
            found = {i: c for i, c in found.items() if "micas" not in fold(c["category"])}
        matches[fbid] = {
            "text": texts, "models": sorted(keys),
            "candidates": sorted(found), "names": sorted(c["name"] for c in found.values()),
        }
        outcome["no model text" if not keys else "model not in catalog" if not found else
                "1 product" if len(found) == 1 else "several styles"] += 1

    (folder / "matches.json").write_text(json.dumps(matches, ensure_ascii=False, indent=1), "utf-8")
    print(f"{len(matches)} photos:", dict(outcome))
    unknown = Counter(m for v in matches.values() if v["models"] and not v["candidates"] for m in v["models"])
    print("models seen but not in catalog:", unknown.most_common(15))


if __name__ == "__main__":
    main()
