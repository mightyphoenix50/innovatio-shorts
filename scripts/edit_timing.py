"""Timing for the shared editing layer (remotion/src/shared/Edit.tsx), mirrored in Python for the sound bed.

Keep these in step with Edit.tsx: wordsOf, beatTime and coldOpenLength.
"""
import re

COLD_OPEN_DEFAULT = 1.3


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def words_of(line: dict) -> list[dict]:
    """Each word's start/end and text; before the voice exists, spread evenly over the line."""
    text = line["text"]
    if line.get("words"):
        return [dict(w, text=text[w["char"]: w["char"] + w["len"]]) for w in line["words"]]
    parts = [(m.start(), m.group(0)) for m in re.finditer(r"\S+", text)]
    a = line["from"] + 0.15
    b = max(a + 0.5, line["to"] - 0.45)
    n = max(1, len(parts))
    return [{"start": a + (b - a) * i / n, "end": a + (b - a) * (i + 1) / n, "char": c, "len": len(w), "text": w}
            for i, (c, w) in enumerate(parts)]


def beat_time(line: dict, beat: dict) -> float:
    if beat.get("word"):
        target = _norm(beat["word"].split()[0])
        words = words_of(line)
        for w in words:
            if _norm(w["text"]) == target:
                return w["start"]
        for w in words:
            if _norm(w["text"]).startswith(target):
                return w["start"]
    return line["from"] + float(beat.get("at", 0.6))


def cold_open_length(ep: dict) -> float:
    hook = ep.get("hook") or {}
    pl = hook.get("previewLine")
    if pl is None or not (0 <= pl < len(ep["narration"])):
        return 0.0
    return float(hook.get("coldOpen", COLD_OPEN_DEFAULT))


def edit_hits(ep: dict) -> list[tuple[str, float, str]]:
    """Sound hits for the hook and beats: (need, time in s, align)."""
    hits = []
    cut = cold_open_length(ep)
    if cut:
        if (ep.get("hook") or {}).get("flash"):
            hits.append(("impact_boom", 0.08, "attack"))
        hits.append(("whoosh", cut, "peak"))
    if (ep.get("hook") or {}).get("banner"):
        hits.append(("ui_click", cut + 0.05, "attack"))
    if ep.get("template") == "Scale":
        # A whoosh as the camera pulls back to each new object (the move peaks about 0.9 s into its line).
        for o in ep.get("objects", [])[1:]:
            hits.append(("whoosh", ep["narration"][o["line"]]["from"] + 0.95, "peak"))
    for line in ep["narration"]:
        for b in line.get("beats") or []:
            t = beat_time(line, b)
            hits.append(("impact_boom" if b["kind"] == "stamp" else "ui_click", t, "attack"))
    return hits


def edit_needs(ep: dict) -> list[str]:
    return sorted({n for n, _, _ in edit_hits(ep)})
