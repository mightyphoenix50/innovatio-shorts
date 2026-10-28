"""Checks an episode file before it's rendered, so a bad file fails here with a clear message instead of mid-render.

    python scripts/validate_episode.py remotion/episodes/queue/<episode>.json

Mirrors the Remotion schemas (remotion/src/descent/types.ts and remotion/src/fall/types.ts) plus the
channel's own rules: sources for every fact, titles under 100 characters, scenes in order, a known sound need.
Exits 0 when the file is fine, 1 with a list of problems otherwise. Needs only the standard library.
"""
import json
import os
import re
import sys

if sys.stdout is not None and sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

CREATURES = {"fish", "turtle", "jelly", "lantern", "squid", "whale", "angler", "gulper", "dumbo", "cuc", "snail", "amph", "xeno"}
LANDMARKS = {"mine", "borehole", "boundary", "center", "mountain", "plane", "balloon", "station"}
DOWN_TEXTURES = {"soil", "strata", "granite", "mantle", "liquid", "crystal"}
UP_TEXTURES = {"cloud", "ozone", "haze", "aurora", "stars"}
SFX_NEEDS = {"dive_splash", "sonar_ping", "hull_creak", "seabed_thud", "whoosh",
             "fall_wind", "rock_rumble", "lava_bubble", "plane_flyby", "station_beep"}
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def _pairs(v) -> bool:
    return isinstance(v, list) and len(v) >= 2 and all(
        isinstance(p, list) and len(p) == 2 and all(isinstance(x, (int, float)) for x in p) for p in v)


def validate(ep: dict, filename: str = "") -> list[str]:
    p = []
    req = lambda k: p.append(f"missing '{k}'") if k not in ep else None  # noqa: E731
    template = ep.get("template", "Descent")
    if template not in ("Descent", "Fall"):
        p.append(f"template must be Descent or Fall, not {template!r}")
    if filename:
        slug = os.path.splitext(os.path.basename(filename))[0]
        if not SLUG.match(slug):
            p.append(f"file name '{slug}' should be lowercase words joined by hyphens")
    for k in ("title", "keyframes", "maxDepth", "temperature", "narration", "youtube", "sources"):
        req(k)

    k = ep.get("keyframes", [])
    if not _pairs(k):
        p.append("keyframes must be a list of [seconds, metres] pairs")
    elif any(b[0] < a[0] for a, b in zip(k, k[1:])):
        p.append("keyframes must be in time order")
    if not _pairs(ep.get("temperature", [])):
        p.append("temperature must be a list of [metres, °C] pairs")

    lines = ep.get("narration", [])
    if not 5 <= len(lines) <= 12:
        p.append(f"narration should have 5–12 lines (has {len(lines)})")
    for i, n in enumerate(lines):
        for f in ("from", "to", "heading", "text"):
            if f not in n:
                p.append(f"narration[{i}] missing '{f}'")
        if "from" in n and "to" in n and n["to"] <= n["from"]:
            p.append(f"narration[{i}] ends before it starts")
        if i and "from" in n and abs(n["from"] - lines[i - 1].get("to", -1)) > 0.01:
            p.append(f"narration[{i}] should start where line {i - 1} ends")
        words = len(n.get("text", "").split())
        if words > 28:
            p.append(f"narration[{i}] has {words} words; keep lines under 28 so captions fit")
        if len(n.get("heading", "")) > 28:
            p.append(f"narration[{i}] heading is too long for the caption card")
    total = sum(len(n.get("text", "").split()) for n in lines)
    if not 90 <= total <= 190:
        p.append(f"script is {total} words; aim for 110–170 (about 45–60 s spoken)")

    yt = ep.get("youtube", {})
    titles = yt.get("titles", [])
    if not 1 <= len(titles) <= 2:
        p.append("youtube.titles needs one or two titles")
    for t in titles:
        if len(t) > 100:
            p.append(f"title over 100 characters: {t!r}")
    if not yt.get("description"):
        p.append("youtube.description is empty")

    sources = ep.get("sources", [])
    if len(sources) < 3:
        p.append("list at least 3 sources (one per fact)")
    for s in sources:
        if not str(s.get("url", "")).startswith("https://"):
            p.append(f"source url must start with https://: {s.get('url')!r}")
        if not s.get("claim"):
            p.append("every source needs the claim it supports")

    for s in ep.get("sfx") or []:
        if s.get("need") not in SFX_NEEDS:
            p.append(f"unknown sound need {s.get('need')!r}; use one of {', '.join(sorted(SFX_NEEDS))}")
        at = s.get("at")
        if isinstance(at, str) and not (at in ("fallAt", "diagramAt", "platesAt") or re.match(r"^depth:\d+(\.\d+)?$", at)):
            p.append(f"sfx 'at' must be seconds, fallAt, diagramAt or depth:<metres>, not {at!r}")

    if template == "Descent":
        for f in ("colours", "zones", "creatures"):
            req(f)
        for c in ep.get("creatures", []):
            if c.get("kind") not in CREATURES:
                p.append(f"unknown creature {c.get('kind')!r}; use one of {', '.join(sorted(CREATURES))}")
            if not 0 <= c.get("x", -1) <= 1:
                p.append("creature x must be between 0 and 1")
        for z in ep.get("zones", []):
            if not HEX.match(str(z.get("colour", ""))):
                p.append(f"zone colour must be #RRGGBB: {z.get('colour')!r}")
    else:
        up = ep.get("direction", "down") == "up"
        for f in ("fallAt", "visualScale", "layers", "landmarks", "pressure"):
            req(f)
        if not _pairs(ep.get("visualScale", [])):
            p.append("visualScale must be a list of [metres, px] pairs")
        else:
            vs = ep["visualScale"]
            if any(b[0] <= a[0] or b[1] <= a[1] for a, b in zip(vs, vs[1:])):
                p.append("visualScale must increase in both metres and px")
            if vs[-1][0] < ep.get("maxDepth", 0):
                p.append("visualScale must reach past maxDepth")
        textures = UP_TEXTURES if up else DOWN_TEXTURES
        for L in ep.get("layers", []):
            if L.get("texture") not in textures:
                p.append(f"layer texture {L.get('texture')!r} doesn't draw when going {'up' if up else 'down'}; "
                         f"use one of {', '.join(sorted(textures))}")
            for c in ("colourTop", "colourBottom"):
                if not HEX.match(str(L.get(c, ""))):
                    p.append(f"layer {L.get('name')!r} {c} must be #RRGGBB")
        for L in ep.get("landmarks", []):
            if L.get("kind") not in LANDMARKS:
                p.append(f"unknown landmark {L.get('kind')!r}; use one of {', '.join(sorted(LANDMARKS))}")
            if len(L.get("label", "")) > 30:
                p.append(f"landmark label too long: {L.get('label')!r}")
        d = ep.get("diagram")
        if d:
            for f in ("start", "end", "timer", "speed"):
                if not d.get(f):
                    p.append(f"diagram.{f} is empty")
            if ep.get("diagramAt") is None:
                p.append("diagram needs diagramAt")
        if ep.get("pressureUnit", "atm") not in ("atm", "percent"):
            p.append("pressureUnit must be atm or percent")
    return p


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/validate_episode.py <episode>.json")
    path = sys.argv[1]
    try:
        with open(path, "r", encoding="utf-8") as f:
            ep = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"✗ can't read {path}: {e}")
        raise SystemExit(1)
    problems = validate(ep, path)
    if problems:
        print(f"✗ {path}")
        for x in problems:
            print(f"  - {x}")
        raise SystemExit(1)
    print(f"✓ {path} is ready to produce")


if __name__ == "__main__":
    main()
