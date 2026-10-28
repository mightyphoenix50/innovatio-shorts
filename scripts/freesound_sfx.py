"""Search Freesound for CC0 / CC BY sound effects and download their high-quality previews with provenance.

Needs a free API key in .env as FREESOUND_API_KEY (https://freesound.org/apiv2/apply).
Only CC0 and CC BY are accepted; NonCommercial, Sampling+ and anything else is refused.
Manifests use the real-sound skill's format (audio/assets/manifests/<category>.json).

    python scripts/freesound_sfx.py search "sonar ping" --max-seconds 6
    python scripts/freesound_sfx.py get 123456 --category sfx --need sonar_ping
"""
import argparse
import os
import re
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import requests

from scripts.env_config import ROOT, load_dotenv
from scripts.openverse_sfx import ASSETS, _clean, update_manifest

if sys.stdout is not None and sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

API = "https://freesound.org/apiv2"
FIELDS = "id,name,username,license,duration,previews,url,num_downloads,avg_rating"


def available() -> bool:
    load_dotenv()
    return bool(os.environ.get("FREESOUND_API_KEY", "").strip())


def _key() -> str:
    load_dotenv()
    key = os.environ.get("FREESOUND_API_KEY", "").strip()
    if not key:
        raise RuntimeError("Add FREESOUND_API_KEY to .env (free key: https://freesound.org/apiv2/apply)")
    return key


def licence_of(url: str) -> tuple[str | None, str | None]:
    """Freesound licence URL -> (display name, canonical URL); (None, None) if not allowed."""
    u = (url or "").lower()
    if "publicdomain/zero" in u:
        return "CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/"
    m = re.search(r"/licenses/([a-z-]+)/(\d\.\d)", u)
    if m and m.group(1) == "by":
        v = m.group(2)
        return f"CC BY {v}", f"https://creativecommons.org/licenses/by/{v}/"
    return None, None


def _get(url: str, params: dict, tries: int = 3):
    last = None
    for attempt in range(tries):
        try:
            # The key goes in a header, never the URL, so it can't show up in error messages or logs.
            r = requests.get(url, params=params, headers={"Authorization": f"Token {_key()}"}, timeout=40)
            if r.status_code == 429:
                time.sleep(10 * (attempt + 1))
                continue
            if r.status_code >= 400:
                raise requests.HTTPError(f"Freesound returned {r.status_code} for {url.split('?')[0]}")
            return r.json()
        except requests.RequestException as e:
            last = e
            time.sleep(2 * (attempt + 1))
    raise last or RuntimeError("Freesound request failed")


def search_items(query: str, n: int = 15, max_seconds: float | None = None, min_seconds: float = 0.2) -> list:
    filt = 'license:("Creative Commons 0" OR "Attribution")'
    if max_seconds:
        filt += f" duration:[{min_seconds} TO {max_seconds}]"
    j = _get(f"{API}/search/text/", {"query": query, "filter": filt, "fields": FIELDS, "page_size": min(n, 50)})
    out = []
    for it in j.get("results", []):
        name, _ = licence_of(it.get("license"))
        if name and (it.get("previews") or {}).get("preview-hq-ogg"):
            out.append(it)
    return out


def download(item: dict | int | str, category: str = "sfx", need: str = "", rank: int = 1) -> dict:
    if not isinstance(item, dict):
        item = _get(f"{API}/sounds/{int(item)}/", {"fields": FIELDS})
    name, licence_url = licence_of(item.get("license"))
    if not name:
        raise ValueError(f"licence {item.get('license')} is not CC0 or CC BY")
    preview = item["previews"]["preview-hq-ogg"]
    title = _clean(item.get("name"), 200) or "Untitled"
    author = _clean(item.get("username"), 120) or "unknown"
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40] or "sound"
    entry_id = f"fs-{item['id']}"
    folder = os.path.join(ASSETS, category)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f"{entry_id}_{slug}.ogg")
    if not os.path.exists(path):
        with requests.get(preview, timeout=120, stream=True) as dl:
            dl.raise_for_status()
            with open(path, "wb") as f:
                for chunk in dl.iter_content(1 << 16):
                    f.write(chunk)
    page = item.get("url") or f"https://freesound.org/s/{item['id']}/"
    attribution = None
    if name.startswith("CC BY"):
        attribution = f'"{title}" by {author} ({page}), licensed under {name} ({licence_url}), edited'
    entry = {
        "id": entry_id, "category": category, "file": os.path.relpath(path, ROOT).replace("\\", "/"),
        "title": title, "author": author, "source": "freesound", "page_url": page, "download_url": preview,
        "license": name, "license_url": licence_url, "attribution": attribution, "need": need, "rank": rank,
        "best_segment": None, "duration_s": item.get("duration"),
        "notes": "Freesound HQ preview. Confirm the licence on page_url before publishing.",
    }
    update_manifest(entry)
    return entry


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search")
    s.add_argument("query")
    s.add_argument("--n", type=int, default=15)
    s.add_argument("--max-seconds", type=float, default=None)
    g = sub.add_parser("get")
    g.add_argument("id")
    g.add_argument("--category", default="sfx")
    g.add_argument("--need", default="")
    a = p.parse_args()
    if a.cmd == "search":
        print(f"{'id':>8}  {'len':>6}  {'licence':10}  {'downloads':>9}  title")
        for it in search_items(a.query, a.n, a.max_seconds):
            name, _ = licence_of(it["license"])
            print(f"{it['id']:>8}  {it['duration']:5.1f}s  {name:10}  {it.get('num_downloads', 0):>9}  {_clean(it['name'])}")
    else:
        e = download(a.id, a.category, a.need)
        print(f"Saved {e['file']}  ({e['license']}{', credit required' if e['attribution'] else ''})")


if __name__ == "__main__":
    main()
