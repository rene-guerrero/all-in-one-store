"""Contact sheets for reviewing matched photos: numbered thumbnails with a caption each.

Usage: python -I scripts/fb_sheets.py <dir> <items.json> <out_prefix> [per_sheet]
  items.json: [{"fbid": ..., "caption": ...}, ...]   -> <out_prefix>-01.png, -02.png ...
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

CELL, PAD, CAPTION = 230, 6, 34


def main() -> None:
    folder, items = Path(sys.argv[1]), json.loads(Path(sys.argv[2]).read_text("utf-8"))
    prefix, per = sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 24
    cols = 6
    try:
        font = ImageFont.truetype("arialbd.ttf", 13)
    except OSError:
        font = ImageFont.load_default()
    for s in range(0, len(items), per):
        chunk = items[s:s + per]
        rows = (len(chunk) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * (CELL + PAD), rows * (CELL + CAPTION + PAD)), "white")
        draw = ImageDraw.Draw(sheet)
        for i, item in enumerate(chunk):
            x, y = (i % cols) * (CELL + PAD), (i // cols) * (CELL + CAPTION + PAD)
            img = Image.open(folder / f"{item['fbid']}.jpg").convert("RGB")
            img.thumbnail((CELL, CELL))
            sheet.paste(img, (x + (CELL - img.width) // 2, y + (CELL - img.height) // 2))
            draw.rectangle((x, y, x + 34, y + 20), fill="black")
            draw.text((x + 4, y + 3), str(s + i + 1), fill="yellow", font=font)
            draw.text((x + 2, y + CELL + 2), item["caption"][:34], fill="black", font=font)
            draw.text((x + 2, y + CELL + 17), item["caption"][34:68], fill="black", font=font)
        out = f"{prefix}-{s // per + 1:02d}.png"
        sheet.save(out)
        print(out, len(chunk))


if __name__ == "__main__":
    main()
