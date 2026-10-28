"""Finds real, openly licensed recordings for an episode's sound effects and picks the best take by listening.

For each effect the episode needs (a dive splash, sonar pings, hull creaks, a seabed thud, a whoosh):
  1. searches Freesound (FREESOUND_API_KEY in .env), or Openverse without a key, with two phrasings,
     keeping only CC0, public-domain and CC BY clips;
  2. downloads the top candidates into audio/assets/sfx/ (each recorded in audio/assets/manifests/sfx.json);
  3. listens with earshot: finds the best moment in each clip, scores how well it matches the description,
     and rejects anything that sounds code-synthesised rather than recorded;
  4. writes the winners to audio/sfx_choices/<episode>.json and the credit lines to output/credits/<episode>.txt.

sound_design.py then uses these real clips instead of its code-made effects.

Run it with the earshot environment's Python (it has earshot and requests):
    tools\\earshot\\.venv\\Scripts\\python.exe scripts\\source_sfx.py remotion\\episodes\\mariana.json

Options: --per-need N (candidates per effect, default 4), --only sonar_ping,seabed_thud, --fresh (ignore old picks).
Before publishing, open each chosen clip's page_url once to confirm its licence on the source site.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

if sys.stdout is not None and sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

from scripts.env_config import ROOT
from scripts import openverse_sfx as ov
from scripts import freesound_sfx as fs

CHOICES_DIR = os.path.join(ROOT, "audio", "sfx_choices")

# What each effect is for. `listen` is the description earshot scores against; `max_len` caps the trimmed clip.
NEEDS = {
    "dive_splash": {
        "queries": ["underwater splash dive", "object dropped into water splash"],
        "listen": "a splash of a heavy object entering water",
        "max_clip": 12, "max_len": 2.4, "ring_out": True,
    },
    "sonar_ping": {
        "queries": ["sonar ping", "submarine sonar"],
        "listen": "a submarine sonar ping",
        "max_clip": 15, "max_len": 2.0,
        # A real sonar ping is an electronic tone, so a synthesised-sounding take is fine here.
        "allow_synth": True,
    },
    "hull_creak": {
        "queries": ["metal creak", "ship hull creaking"],
        "listen": "a deep metal hull creaking under pressure",
        "max_clip": 20, "max_len": 2.0,
    },
    "seabed_thud": {
        "queries": ["heavy thud impact", "deep boom impact"],
        "listen": "a heavy deep thud impact",
        "max_clip": 10, "max_len": 1.6, "ring_out": True,
    },
    "whoosh": {
        "queries": ["whoosh", "swoosh transition", "air whoosh swish", "fast pass by whoosh"],
        "listen": "a whoosh",
        "pad": 0.45,  # keep the swell before and the tail after the loudest moment
        "max_clip": 6, "max_len": 1.4,
    },
    # Fall template
    "fall_wind": {
        "queries": ["wind rushing past falling", "strong wind gust whoosh", "skydiving wind"],
        "listen": "strong wind rushing past while falling",
        "max_clip": 20, "max_len": 3.0,
    },
    "rock_rumble": {
        "queries": ["earthquake rumble", "rock rumble low", "cave rumble"],
        "listen": "a deep rumble of rocks shaking underground",
        "max_clip": 15, "max_len": 2.0, "ring_out": True,
    },
    "lava_bubble": {
        "queries": ["lava bubbling", "mud bubbling boiling", "thick liquid bubbling"],
        "listen": "thick molten lava bubbling",
        "max_clip": 20, "max_len": 2.5,
    },
    "plane_flyby": {
        "queries": ["jet airplane flyby", "airliner passing overhead", "plane fly by"],
        "listen": "a jet airliner flying past",
        "max_clip": 20, "max_len": 3.0,
    },
    # End skit: the mascot popping in
    "cartoon_pop": {
        "queries": ["cartoon pop", "bubble pop cute", "comedy pop boing"],
        "listen": "a short cute cartoon pop",
        "max_clip": 4, "max_len": 0.8,
        "allow_synth": True,  # cartoon pops are meant to sound made
    },
    # The editing layer (shared/Edit.tsx): beats and the hook
    "ui_click": {
        "queries": ["ui click pop", "interface pop click", "soft pop notification"],
        "listen": "a short clean user interface click or pop",
        "max_clip": 3, "max_len": 0.5,
        "allow_synth": True,  # UI sounds are made, not recorded
    },
    "impact_boom": {
        "queries": ["cinematic impact boom", "trailer hit boom", "deep impact hit"],
        "listen": "a deep cinematic impact boom",
        "max_clip": 8, "max_len": 2.0, "ring_out": True,
        "allow_synth": True,
    },
    "station_beep": {
        "queries": ["space radio beep", "satellite beep", "radio beep transmission"],
        "listen": "an electronic radio beep from a spacecraft",
        "max_clip": 10, "max_len": 2.0,
        "allow_synth": True,  # an electronic beep is meant to sound synthetic
    },
}


DESCENT_NEEDS = ("dive_splash", "sonar_ping", "hull_creak", "seabed_thud", "whoosh")


def _earshot():
    try:
        from earshot import api  # noqa: WPS433
        return api
    except ImportError:
        return None


def _judge(api, path: str, need: dict) -> dict | None:
    """Best moment in the clip, how well it matches, and whether it sounds like a real recording."""
    try:
        found = api.find(path, need["listen"], top=1, kind="auto")
        seg = (found.get("segments") or [None])[0]
        if seg is None:
            return None
        start = seg["start"]
        end = min(seg["end"], start + need["max_len"])
        if need.get("pad"):
            dur = float(found.get("duration") or end)
            start = max(0.0, start - need["pad"])
            end = min(dur, max(end + need["pad"], start + 0.8), start + need["max_len"])
        if need.get("ring_out"):  # let impacts decay naturally instead of cutting at the event's end
            end = min(start + need["max_len"], float(found.get("duration") or end))
        m = api.match(path, need["listen"], start=start, end=end)
        real = api.realness(path, start=start, end=end)
    except Exception as e:  # noqa: BLE001 - a broken download should not stop the run
        print(f"      skipped ({type(e).__name__}: {e})")
        return None
    return {
        "start": round(start, 3),
        "end": round(end, 3),
        "z": round(float(m.get("z", 0.0)), 2),
        "match": m.get("verdict"),
        "p_real": real.get("p_real"),
        "realness": real.get("verdict"),
    }


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("episode", help="remotion/episodes/<episode>.json")
    p.add_argument("--per-need", type=int, default=4)
    p.add_argument("--only", default="", help="comma-separated effect names to (re)source")
    p.add_argument("--fresh", action="store_true", help="ignore earlier picks")
    a = p.parse_args()

    api = _earshot()
    if api is None:
        print("earshot isn't available in this Python, so clips are picked by search order only.\n"
              "Run with tools\\earshot\\.venv\\Scripts\\python.exe to let earshot listen and choose.\n")

    use_freesound = fs.available()
    print("Source:", "Freesound" if use_freesound else
          "Openverse (add FREESOUND_API_KEY to .env to use Freesound, which is faster and more reliable)")

    episode = os.path.splitext(os.path.basename(a.episode))[0]
    CHOICES = os.path.join(CHOICES_DIR, f"{episode}.json")
    choices = {}
    if os.path.exists(CHOICES) and not a.fresh:
        with open(CHOICES, "r", encoding="utf-8") as f:
            choices = json.load(f)
    with open(a.episode, "r", encoding="utf-8") as f:
        ep = json.load(f)
    # An episode with an sfx plan sources only the needs it names; otherwise the Descent set.
    planned = [x["need"] for x in ep.get("sfx") or []]
    base = [n for n in NEEDS if n in planned] if planned else [n for n in NEEDS if n in DESCENT_NEEDS]
    if ep.get("skit") and "cartoon_pop" not in base:
        base.append("cartoon_pop")
    from scripts.edit_timing import edit_needs
    base += [n for n in edit_needs(ep) if n not in base]
    wanted = [n for n in base if not a.only or n in a.only.split(",")]

    for name in wanted:
        need = NEEDS[name]
        print(f"\n== {name}: {need['listen']}")
        seen, cands = set(), []
        for q in need["queries"]:
            try:
                found = (fs.search_items(q, n=15, max_seconds=need["max_clip"]) if use_freesound
                         else ov.search_items(q, n=20, max_seconds=need["max_clip"]))
                for it in found:
                    who = it.get("username") or it.get("creator") or it["id"]
                    if it["id"] not in seen and who not in seen:  # one take per uploader, for variety
                        seen.update({it["id"], who})
                        cands.append(it)
            except Exception as e:  # noqa: BLE001
                print(f"   search '{q}' failed: {e}")
        cands = cands[: a.per_need]
        if not cands:
            print("   no openly licensed candidates found; the code-made effect will be used")
            continue

        best = None
        for rank, it in enumerate(cands, 1):
            try:
                entry = (fs.download(it, category="sfx", need=name, rank=rank) if use_freesound
                         else ov.download(it["id"], category="sfx", need=name, rank=rank))
            except Exception as e:  # noqa: BLE001
                print(f"   [{rank}] download failed: {e}")
                continue
            path = os.path.join(ROOT, entry["file"])
            if api is None:
                verdict = {"start": 0.0, "end": need["max_len"], "z": 0.0, "match": None, "p_real": None, "realness": None}
            else:
                verdict = _judge(api, path, need)
                if verdict is None:
                    continue
            entry["best_segment"] = [verdict["start"], verdict["end"]]
            entry["earshot"] = {"match": {"query": need["listen"], "z": verdict["z"], "verdict": verdict["match"]},
                                "realness": verdict["p_real"]}
            ov.update_manifest(entry)
            real_ok = need.get("allow_synth") or verdict["p_real"] is None or verdict["p_real"] >= 0.5
            score = verdict["z"] + (0 if real_ok else -10)
            lic = entry["license"] + (" (credit)" if entry["attribution"] else "")
            pr = "?" if verdict["p_real"] is None else f"{verdict['p_real']:.2f}"
            print(f"   [{rank}] {entry['id']}  match z {verdict['z']:+.2f} ({verdict['match']})  real {pr}  {lic}")
            if best is None or score > best[0]:
                best = (score, entry, verdict)

        if best is None:
            print("   nothing usable; the code-made effect will be used")
            continue
        _, entry, verdict = best
        too_synthetic = not need.get("allow_synth") and (verdict["p_real"] or 0) < 0.5
        if api is not None and (verdict["match"] in ("no match", "weak") or too_synthetic):
            print(f"   best candidate is a {verdict['match']} match or doesn't sound recorded; "
                  "keeping the code-made effect (try --per-need 8)")
            choices.pop(name, None)
            continue
        choices[name] = {
            "id": entry["id"], "file": entry["file"], "start": verdict["start"], "end": verdict["end"],
            "license": entry["license"], "attribution": entry["attribution"], "page_url": entry["page_url"],
            "match_z": verdict["z"], "p_real": verdict["p_real"],
        }
        print(f"   -> chose {entry['id']} [{verdict['start']:.2f}-{verdict['end']:.2f} s]")

    os.makedirs(os.path.dirname(CHOICES), exist_ok=True)
    with open(CHOICES, "w", encoding="utf-8") as f:
        json.dump(choices, f, indent=2, ensure_ascii=False)
        f.write("\n")

    credits_dir = os.path.join(ROOT, "output", "credits")
    os.makedirs(credits_dir, exist_ok=True)
    lines = ["Sound effects:"]
    for name, c in choices.items():
        if c.get("attribution"):
            lines.append(f"- {c['attribution']}")
        else:
            lines.append(f"- {name.replace('_', ' ')}: {c['license']}, {c['page_url']}")
    lines.append("Music: original, made for this channel.")
    with open(os.path.join(credits_dir, f"{episode}.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"\nPicks: {os.path.relpath(CHOICES, ROOT)} ({sum(n in choices for n in wanted)} of {len(wanted)} effects use real recordings)")
    print(f"Credits for the video description: output/credits/{episode}.txt")
    print("Next: python scripts\\sound_design.py " + a.episode)


if __name__ == "__main__":
    main()
