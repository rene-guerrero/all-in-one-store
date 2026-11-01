"""Read each harvested photo's post date from its Facebook side-panel text.

Usage: python -I scripts/fb_dates.py scraped/fb/feria [min_date]
Facebook writes "30 de octubre a las 10:03" for the current year and "15 de diciembre de 2025" for older
posts; relative dates ("hace 2 días") are recent. Writes <dir>/dates.json {fbid: "YYYY-MM-DD" | null}
and prints how many photos fall before/after min_date (default 2026-01-01).
"""
import json
import re
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

MONTHS = {m: i for i, m in enumerate(
    "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split(), 1)}
TODAY = date.today()


def post_date(side: str):
    m = re.search(r"(\d{1,2}) de (" + "|".join(MONTHS) + r")(?: de (\d{4}))?", side.lower())
    if m:
        return date(int(m.group(3) or TODAY.year), MONTHS[m.group(2)], int(m.group(1)))
    m = re.search(r"hace (\d+) (minuto|hora|día|dia|semana)", side.lower())
    if m:
        days = {"minuto": 0, "hora": 0, "día": 1, "dia": 1, "semana": 7}[m.group(2)] * int(m.group(1))
        return TODAY - timedelta(days=days)
    return None


def main() -> None:
    folder = Path(sys.argv[1])
    cutoff = date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else date(2026, 1, 1)
    metas = {}
    for line in (folder / "meta.jsonl").read_text("utf-8").splitlines():
        if line.strip():
            m = json.loads(line)
            metas[m["fbid"]] = m
    dates = {fbid: post_date(m.get("side") or "") for fbid, m in metas.items()}
    (folder / "dates.json").write_text(json.dumps({k: v.isoformat() if v else None for k, v in dates.items()}, indent=1), "utf-8")
    kept = sum(1 for d in dates.values() if d and d >= cutoff)
    older = sum(1 for d in dates.values() if d and d < cutoff)
    unknown = [k for k, d in dates.items() if not d]
    print(f"{len(dates)} photos: {kept} from {cutoff} on, {older} older, {len(unknown)} without a date")
    print("by month:", sorted(Counter(d.strftime("%Y-%m") for d in dates.values() if d).items()))
    if unknown:
        print("no date sample:", [metas[k]["side"][:120] for k in unknown[:3]])


if __name__ == "__main__":
    main()
