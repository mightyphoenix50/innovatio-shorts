"""Checks an episode file before it's rendered, so a bad file fails here with a clear message instead of mid-render.

    python scripts/validate_episode.py remotion/episodes/queue/<episode>.json

Mirrors the Remotion schemas (remotion/src/descent/types.ts, remotion/src/fall/types.ts and
remotion/src/orbit/types.ts) plus the
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
BODIES = {"earth", "mars", "moon", "venus", "mercury", "gas", "ice", "lava"}
SFX_NEEDS = {"dive_splash", "sonar_ping", "hull_creak", "seabed_thud", "whoosh",
             "fall_wind", "rock_rumble", "lava_bubble", "plane_flyby", "station_beep", "cartoon_pop"}
SKIT_MOODS = {"wink", "smug", "gasp", "shrug", "laugh"}
COMPARE_ICONS = {"tower", "mountain", "plane", "ship", "person", "building", "whale", "rocket", "moon", "land"}
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def _pairs(v) -> bool:
    return isinstance(v, list) and len(v) >= 2 and all(
        isinstance(p, list) and len(p) == 2 and all(isinstance(x, (int, float)) for x in p) for p in v)


def validate(ep: dict, filename: str = "") -> list[str]:
    p = []
    req = lambda k: p.append(f"missing '{k}'") if k not in ep else None  # noqa: E731
    template = ep.get("template", "Descent")
    if template not in ("Descent", "Fall", "Orbit"):
        p.append(f"template must be Descent, Fall or Orbit, not {template!r}")
    if filename:
        slug = os.path.splitext(os.path.basename(filename))[0]
        if not SLUG.match(slug):
            p.append(f"file name '{slug}' should be lowercase words joined by hyphens")
    orbit = template == "Orbit"
    for k in ("title", "keyframes", "narration", "youtube", "sources") + (() if orbit else ("maxDepth", "temperature")):
        req(k)

    k = ep.get("keyframes", [])
    if not _pairs(k):
        p.append(f"keyframes must be a list of [seconds, {'zoom' if orbit else 'metres'}] pairs")
    elif any(b[0] < a[0] for a, b in zip(k, k[1:])):
        p.append("keyframes must be in time order")
    if not orbit and not _pairs(ep.get("temperature", [])):
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
        if isinstance(at, str) and not (at in ("fallAt", "diagramAt", "platesAt", "skit") or re.match(r"^depth:\d+(\.\d+)?$", at)):
            p.append(f"sfx 'at' must be seconds, fallAt, diagramAt, skit or depth:<metres>, not {at!r}")

    sk = ep.get("skit")
    if sk is None and "queue" in os.path.normpath(filename).split(os.sep):
        p.append("new episodes need a 'skit': Bit's one-line joke at the end (see the guide)")
    if sk is not None:
        text = str(sk.get("text", ""))
        if not text:
            p.append("skit.text is empty")
        if len(text.split()) > 16:
            p.append(f"skit.text has {len(text.split())} words; keep the joke to 16 or fewer")
        if any(ch in text for ch in "&<>"):
            p.append("skit.text can't contain &, < or >")
        if sk.get("mood", "wink") not in SKIT_MOODS:
            p.append(f"skit.mood must be one of {', '.join(sorted(SKIT_MOODS))}")
        if len(str(sk.get("action", ""))) > 24:
            p.append("skit.action is too long (≤ 24 characters)")

    # The hook and beats (the editing layer, shared/Edit.tsx)
    queued = "queue" in os.path.normpath(filename).split(os.sep)
    hook = ep.get("hook")
    if hook is None and queued:
        p.append("new episodes need a 'hook': banner, flash and previewLine (see the guide)")
    if hook is not None:
        banner = str(hook.get("banner", ""))
        if not banner or len(banner.split()) > 8 or banner[-1:] not in "?!":
            p.append("hook.banner must be ≤ 8 words and end with ? or !")
        if len(str(hook.get("flash", ""))) > 18:
            p.append("hook.flash is too long (≤ 18 characters)")
        pl = hook.get("previewLine")
        if pl is not None and not (2 <= pl < len(lines)):
            p.append("hook.previewLine must point at a later narration line (2 or more), usually the climax")
        if queued and (pl is None or not hook.get("flash")):
            p.append("new episodes need hook.flash and hook.previewLine for the cold open")
    if lines:
        first = lines[0].get("text", "")
        if queued and len(first.split()) > 16:
            p.append(f"the hook line has {len(first.split())} words; keep it to 16 or fewer")
        if queued and not re.search(r"\byou(r|'re|'d|'ll)?\b", first.lower()):
            p.append("the hook line should speak to the viewer (use 'you')")
    beat_kinds = {"stat", "compare", "stamp", "warning"}
    with_beats = 0
    for i, n in enumerate(lines):
        bs = n.get("beats") or []
        if bs:
            with_beats += 1
        if len(bs) > 3:
            p.append(f"narration[{i}] has {len(bs)} beats; 3 at most")
        norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
        words = [norm(w) for w in n.get("text", "").split()]
        for b in bs:
            if b.get("kind") not in beat_kinds:
                p.append(f"narration[{i}] beat kind must be one of {', '.join(sorted(beat_kinds))}")
                continue
            if b.get("word") and not any(w.startswith(norm(b["word"].split()[0])) for w in words if w):
                p.append(f"narration[{i}] beat word {b['word']!r} isn't in the line's text")
            if b["kind"] in ("stat", "stamp", "warning") and not b.get("value"):
                p.append(f"narration[{i}] {b['kind']} beat needs a value")
            if b["kind"] in ("stamp", "warning") and len(str(b.get("value", ""))) > 18:
                p.append(f"narration[{i}] {b['kind']} text is too long (≤ 18 characters)")
            if b["kind"] == "compare":
                c = b.get("compare") or {}
                need = ("name", "value", "icon", "subject", "subjectValue", "unit")
                if any(k2 not in c for k2 in need):
                    p.append(f"narration[{i}] compare beat needs {', '.join(need)}")
                elif c["icon"] not in COMPARE_ICONS:
                    p.append(f"narration[{i}] compare icon must be one of {', '.join(sorted(COMPARE_ICONS))}")
    if queued and lines and with_beats < max(1, round(0.6 * (len(lines) - 1))):
        p.append(f"only {with_beats} lines have beats; give at least 60% of the lines after the hook one or two")

    if orbit:
        if _pairs(k) and any(not 0 <= z <= 1 for _, z in k):
            p.append("Orbit keyframes are [seconds, zoom] with zoom from 0 (far) to 1 (close)")
        if not ep.get("sfx"):
            p.append("Orbit episodes need an sfx list (3–7 effects)")
        b = ep.get("body") or {}
        if not b:
            p.append("missing 'body'")
        if b and b.get("kind") not in BODIES:
            p.append(f"unknown body kind {b.get('kind')!r}; use one of {', '.join(sorted(BODIES))}")
        if b and not b.get("name"):
            p.append("body.name is empty")
        for c in (b.get("colours") or []):
            if not HEX.match(str(c)):
                p.append(f"body colour must be #RRGGBB: {c!r}")
        if b.get("colours") is not None and len(b["colours"]) != 3:
            p.append("body.colours needs exactly three colours (light to dark)")
        if b.get("glow") is not None and not HEX.match(str(b["glow"])):
            p.append("body.glow must be #RRGGBB")
        stops = ep.get("stops", [])
        if len(stops) < 3:
            p.append("Orbit needs at least 3 stops (places on the world)")
        seen = set()
        for i, st in enumerate(stops):
            line = st.get("line")
            if not isinstance(line, int) or not 0 <= line < len(lines):
                p.append(f"stops[{i}].line must be a narration line index (0–{len(lines) - 1})")
            elif line in seen:
                p.append(f"stops[{i}]: line {line} already has a stop")
            seen.add(line)
            if not -90 <= st.get("lat", 999) <= 90 or not -180 <= st.get("lon", 999) <= 180:
                p.append(f"stops[{i}] needs lat -90..90 and lon -180..180")
            if not st.get("label") or len(st.get("label", "")) > 24:
                p.append(f"stops[{i}].label must be 1–24 characters")
            if len(st.get("value", "")) > 9:
                p.append(f"stops[{i}].value is too long for the stat card (≤ 9 characters)")
            if len(st.get("caption", "")) > 22:
                p.append(f"stops[{i}].caption is too long (≤ 22 characters)")
    elif template == "Descent":
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
