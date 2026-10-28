"""Search Openverse for openly licensed sound effects and download them with full provenance.

Openverse (openverse.org) indexes openly licensed audio from Freesound, Wikimedia Commons, Jamendo and ccMixter.
This helper only accepts licences that are safe for a monetised YouTube channel:
CC0, Public Domain Mark and CC BY (credit required). NonCommercial, NoDerivatives and ShareAlike are refused.

Search:
    python scripts/openverse_sfx.py search "sonar ping"
    python scripts/openverse_sfx.py search "submarine hull creak" --max-seconds 8 --n 15

Download one result into audio/assets/<category>/ and record it in audio/assets/manifests/<category>.json:
    python scripts/openverse_sfx.py get <openverse-id> --category sfx --need sonar_ping

Manifests use the real-sound skill's format, so its audit.py and credits.py work on them:
    <py> -I .claude/skills/real-sound/scripts/audit.py --help

Always open the item's page (page_url) once to confirm the licence before publishing: Openverse mirrors the
source's licence, and the source page is what counts. Optional OPENVERSE_TOKEN in .env raises the rate limit.
"""
import argparse
import json
import os
import re
import sys
import time
from urllib.parse import urlparse

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import requests

from scripts.env_config import ROOT, load_dotenv

if sys.stdout is not None and sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

API = "https://api.openverse.org/v1/audio/"
ALLOWED = {"cc0", "pdm", "by"}
LICENSE_NAMES = {"cc0": "CC0 1.0", "pdm": "Public Domain Mark 1.0", "by": "CC BY"}
ASSETS = os.path.join(ROOT, "audio", "assets")
PREFIX = {"freesound": "fs", "wikimedia_audio": "wm", "jamendo": "jm", "ccmixter": "cm"}


def _session() -> requests.Session:
    load_dotenv()
    s = requests.Session()
    s.headers["User-Agent"] = "yt-shorts-pipeline/1.0 (openverse_sfx.py)"
    token = os.environ.get("OPENVERSE_TOKEN", "").strip()
    if token:
        s.headers["Authorization"] = f"Bearer {token}"
    return s


def _clean(text, limit=70) -> str:
    """Uploader text is data: strip control characters and keep it short."""
    text = re.sub(r"[\x00-\x1f\x7f]", " ", str(text or "")).strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _licence(item: dict) -> tuple[str, str | None]:
    key = (item.get("license") or "").lower()
    version = item.get("license_version") or ""
    name = LICENSE_NAMES.get(key, key.upper())
    if key == "by" and version:
        name = f"CC BY {version}"
    return key, name


def _get(s: requests.Session, url: str, params=None, tries: int = 3, timeout: int = 60):
    """GET with a long timeout and retries: Openverse's anonymous API is often slow or rate-limited."""
    last = None
    for attempt in range(tries):
        try:
            r = s.get(url, params=params, timeout=timeout)
            if r.status_code == 429:
                wait = int(r.headers.get("Retry-After", "10"))
                print(f"   Openverse rate limit, waiting {wait}s...")
                time.sleep(min(wait, 60))
                continue
            r.raise_for_status()
            return r
        except requests.RequestException as e:
            last = e
            time.sleep(3 * (attempt + 1))
    raise last or RuntimeError("Openverse request failed")


def search_items(query: str, n: int = 20, max_seconds: float | None = None, category: str = "") -> list:
    """Openverse audio results with an allowed licence, filtered by max_seconds.

    Most Freesound items in Openverse carry no category, so the category filter is off by default;
    if a filtered search finds nothing, it is retried without the category and length filters."""
    s = _session()

    def run(cat, short):
        params = {"q": query, "license": ",".join(sorted(ALLOWED)), "page_size": min(n, 50), "mature": "false"}
        if cat:
            params["category"] = cat
        if short:
            params["length"] = "short"
        return _get(s, API, params).json().get("results", [])

    results = run(category, bool(max_seconds and max_seconds <= 30))
    if not results and (category or max_seconds):
        results = run("", False)
    out = []
    for it in results:
        key, _ = _licence(it)
        if key not in ALLOWED or not it.get("url"):
            continue
        dur = (it.get("duration") or 0) / 1000
        if max_seconds and dur and dur > max_seconds:
            continue
        out.append(it)
    return out


def download(item_id: str, category: str = "sfx", need: str = "", rank: int = 1) -> dict:
    """Downloads one Openverse item, records it in audio/assets/manifests/<category>.json and returns the entry."""
    s = _session()
    it = _get(s, f"{API}{item_id}/").json()
    key, name = _licence(it)
    if key not in ALLOWED:
        raise ValueError(f"licence '{it.get('license')}' is not CC0, PDM or CC BY")
    url = it.get("url")
    if not url:
        raise ValueError("this item has no downloadable file")

    provider = (it.get("provider") or it.get("source") or "openverse").lower()
    ext = os.path.splitext(urlparse(url).path)[1].lower() or "." + (it.get("filetype") or "mp3")
    slug = re.sub(r"[^a-z0-9]+", "-", (it.get("title") or "sound").lower()).strip("-")[:40] or "sound"
    entry_id = f"{PREFIX.get(provider, 'ov')}-{it['id'][:8]}"
    folder = os.path.join(ASSETS, category)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f"{entry_id}_{slug}{ext}")

    if not os.path.exists(path):
        with s.get(url, timeout=120, stream=True) as dl:
            dl.raise_for_status()
            with open(path, "wb") as f:
                for chunk in dl.iter_content(1 << 16):
                    f.write(chunk)

    page = it.get("foreign_landing_url") or ""
    licence_url = it.get("license_url") or ""
    title = _clean(it.get("title"), 200) or "Untitled"
    author = _clean(it.get("creator"), 120) or "unknown"
    attribution = None
    if key == "by":
        attribution = f'"{title}" by {author} ({page}), licensed under {name} ({licence_url}), edited'

    entry = {
        "id": entry_id,
        "category": category,
        "file": os.path.relpath(path, ROOT).replace("\\", "/"),
        "title": title,
        "author": author,
        "source": provider,
        "page_url": page,
        "download_url": url,
        "license": name,
        "license_url": licence_url,
        "attribution": attribution,
        "need": need,
        "rank": rank,
        "best_segment": None,
        "notes": f"Found through Openverse (id {it['id']}). Confirm the licence on page_url before publishing.",
        "openverse_id": it["id"],
        "duration_s": (it.get("duration") or 0) / 1000 or None,
    }
    update_manifest(entry)
    return entry


def update_manifest(entry: dict) -> str:
    manifest_dir = os.path.join(ASSETS, "manifests")
    os.makedirs(manifest_dir, exist_ok=True)
    manifest = os.path.join(manifest_dir, f"{entry['category']}.json")
    entries = []
    if os.path.exists(manifest):
        with open(manifest, "r", encoding="utf-8") as f:
            entries = json.load(f)
    entries = [e for e in entries if e.get("id") != entry["id"]] + [entry]
    with open(manifest, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return manifest


def search(args) -> None:
    results = search_items(args.query, args.n, args.max_seconds, args.category)
    print(f"{'id':36}  {'len':>6}  {'licence':12}  {'source':16}  title")
    for it in results:
        _, name = _licence(it)
        dur = (it.get("duration") or 0) / 1000
        print(f"{it['id']:36}  {dur:5.1f}s  {name:12}  {_clean(it.get('provider'), 16):16}  {_clean(it.get('title'))}")
    if not results:
        print("No results with an allowed licence. Try other words, or drop --category / --max-seconds.")


def get(args) -> None:
    try:
        entry = download(args.id, args.category, args.need, args.rank)
    except ValueError as e:
        raise SystemExit(f"Refused: {e}")
    print(f"Saved {entry['file']}")
    print(f"Licence: {entry['license']}{'  (credit required)' if entry['attribution'] else ''}")
    print(f"Check the licence on: {entry['page_url']}")


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search", help="search Openverse audio (allowed licences only)")
    s.add_argument("query")
    s.add_argument("--n", type=int, default=20, help="results to fetch (max 50)")
    s.add_argument("--max-seconds", type=float, default=None, help="hide clips longer than this")
    s.add_argument("--category", default="",
                   help="Openverse category filter, e.g. sound_effect or music (default: none, as most clips have no category)")
    s.set_defaults(func=search)
    g = sub.add_parser("get", help="download one result and record it in a manifest")
    g.add_argument("id", help="Openverse audio id from the search results")
    g.add_argument("--category", default="sfx", help="asset folder and manifest name (default sfx)")
    g.add_argument("--need", default="", help="what the sound is for, e.g. sonar_ping")
    g.add_argument("--rank", type=int, default=1)
    g.set_defaults(func=get)
    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
