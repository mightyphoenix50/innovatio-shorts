"""One command from episode file to a Short waiting for your approval on Telegram.

    python scripts/produce.py remotion/episodes/mariana.json

Steps (each is skipped when its output already exists, unless you ask for it again):
  1. voice    Azure voiceover + word timings, and the timeline fitted to the voice   (--revoice)
  2. sfx      real recordings from Freesound, picked by earshot                      (--resource)
  3. bed      lobby music + the sound effects                                        (always)
  4. render   Remotion -> output/drafts/<episode>.mp4                                (always)
  5. QC       size, length, loudness, peak, frozen frames, sources present           (always)
  6. send     video + titles + script + sources to Telegram for approval             (skip with --no-send)

Approving on Telegram is handled by scripts/telegram_daemon.py, which must be running (tools/install_daemon.ps1).
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from scripts.env_config import ROOT

if sys.stdout is not None and sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

REMOTION = os.path.join(ROOT, "remotion")
EARSHOT_PY = [os.path.join(ROOT, "tools", "earshot", ".venv", "Scripts", "python.exe"),
              os.path.join(ROOT, "tools", "earshot", ".venv", "bin", "python")]
TELEGRAM_VIDEO_LIMIT = 49 * 1024 * 1024


def step(n: int, text: str) -> None:
    print(f"\n[{n}/6] {text}", flush=True)


def run(cmd: list, cwd: str = ROOT) -> None:
    print("   $ " + " ".join(f'"{c}"' if " " in c else c for c in cmd), flush=True)
    subprocess.run(cmd, cwd=cwd, check=True)


def load(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def measure(video: str) -> dict:
    """Size, length, loudness, true peak and frozen stretches, measured with ffprobe/ffmpeg."""
    probe = json.loads(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height", "-show_entries",
         "format=duration", "-of", "json", video], capture_output=True, text=True, check=True).stdout)
    v = next(s for s in probe["streams"] if s["codec_type"] == "video")
    has_audio = any(s["codec_type"] == "audio" for s in probe["streams"])
    m = {"width": v["width"], "height": v["height"], "duration": float(probe["format"]["duration"]),
         "has_audio": has_audio, "bytes": os.path.getsize(video)}
    err = subprocess.run(["ffmpeg", "-nostats", "-i", video, "-af", "ebur128=peak=true",
                          "-vf", "freezedetect=n=0.003:d=2.5", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    summary = err[err.rfind("Summary:"):] if "Summary:" in err else ""
    i = re.search(r"I:\s+(-?[\d.]+) LUFS", summary)
    p = re.search(r"Peak:\s+(-?[\d.]+) dBFS", summary)
    m["lufs"] = float(i.group(1)) if i else None
    m["true_peak"] = float(p.group(1)) if p else None
    m["frozen"] = [float(x) for x in re.findall(r"freeze_start: ([\d.]+)", err)]
    return m


def qc(ep: dict, video: str) -> dict:
    m = measure(video)
    problems = []
    if (m["width"], m["height"]) != (1080, 1920):
        problems.append(f"size {m['width']}x{m['height']}, expected 1080x1920")
    if not 15 <= m["duration"] <= 180:
        problems.append(f"length {m['duration']:.0f}s is outside 15-180s")
    if not m["has_audio"]:
        problems.append("no audio track")
    if m["lufs"] is not None and not -16.5 <= m["lufs"] <= -11:
        problems.append(f"loudness {m['lufs']} LUFS, aim for about -14")
    if m["true_peak"] is not None and m["true_peak"] > -1.0:
        problems.append(f"peak {m['true_peak']} dBTP is above -1")
    if m["frozen"]:
        problems.append(f"picture frozen at {', '.join(f'{t:.1f}s' for t in m['frozen'][:3])}")
    if not ep.get("sources"):
        problems.append("no sources listed for the facts")
    if not ep.get("youtube", {}).get("titles"):
        problems.append("no YouTube titles in the episode")
    if m["bytes"] > TELEGRAM_VIDEO_LIMIT:
        problems.append("file is over Telegram's 50 MB limit")
    return {"passed": not problems, "problems": problems, "measurements": m}


def description(ep: dict, credits: str) -> str:
    yt = ep.get("youtube", {})
    parts = [yt.get("description", "").strip()]
    if ep.get("sources"):
        parts.append("Sources:\n" + "\n".join(f"- {s['claim']}: {s['url']}" for s in ep["sources"]))
    if credits:
        parts.append(credits.strip())
    parts.append("Made with code-driven animation and a synthetic narrator voice. #shorts #science")
    return "\n\n".join(p for p in parts if p)


TEMPLATES = ("Descent", "Fall", "Orbit")
# Templates drawn with WebGL (three.js). GitHub runners have no GPU, so these use Chrome's software
# renderer; on a PC with a graphics card set REMOTION_GL=angle in .env for faster renders.
WEBGL_TEMPLATES = ("Orbit",)


def render_cmd(episode_path: str, out: str, composition: str = "Descent") -> list:
    """The episode's "template" field picks the Remotion composition (Descent when it has none)."""
    if composition not in TEMPLATES:
        raise SystemExit(f"Unknown template {composition!r}; expected one of {', '.join(TEMPLATES)}")
    npx = shutil.which("npx.cmd") or shutil.which("npx") or "npx"
    cmd = [npx, "remotion", "render", composition, out, f"--props={episode_path}", "--codec=h264", "--crf=20",
           # Loading the voice and music for the first frames can take longer than Remotion's 30 s default on a
           # busy 2-core runner (seen on the 3D template); 2 minutes stops that from failing a render at random.
           "--timeout=120000", "--log=error"]
    if composition in WEBGL_TEMPLATES:
        cmd.append(f"--gl={os.environ.get('REMOTION_GL', 'swangle')}")
    browser = os.environ.get("REMOTION_BROWSER_EXECUTABLE")
    if browser:
        cmd.append(f"--browser-executable={browser}")
    return cmd


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("episode", help="remotion/episodes/<episode>.json")
    p.add_argument("--revoice", action="store_true", help="regenerate the Azure voiceover")
    p.add_argument("--resource", action="store_true", help="re-pick the real sound effects")
    p.add_argument("--no-send", action="store_true", help="stop after QC, don't send to Telegram")
    p.add_argument("--send-anyway", action="store_true", help="send to Telegram even if QC finds problems")
    a = p.parse_args()

    episode_path = os.path.abspath(a.episode)
    name = os.path.splitext(os.path.basename(episode_path))[0]
    py = sys.executable
    started = time.time()

    ep = load(episode_path)
    voice_file = os.path.join(REMOTION, "public", ep["voiceover"]) if ep.get("voiceover") else None
    step(1, "Voiceover")
    if a.revoice or not voice_file or not os.path.exists(voice_file):
        run([py, os.path.join("scripts", "azure_voice.py"), episode_path])
    else:
        print("   using the existing voiceover (--revoice to redo it)")

    step(2, "Real sound effects")
    choices = os.path.join(ROOT, "audio", "sfx_choices", f"{name}.json")
    if a.resource or not os.path.exists(choices):
        earshot = os.environ.get("EARSHOT_PYTHON") or next((x for x in EARSHOT_PY if os.path.exists(x)), None)
        if earshot:
            run([earshot, os.path.join("scripts", "source_sfx.py"), episode_path] + (["--fresh"] if a.resource else []))
        else:
            print("   earshot isn't installed (tools/setup_audio_tools.ps1); the code-made effects will be used")
    else:
        print("   using the effects already picked (--resource to pick again)")

    step(3, "Music and sound-effects bed")
    run([py, os.path.join("scripts", "sound_design.py"), episode_path])

    step(4, "Render")
    out_rel = os.path.join("output", "drafts", f"{name}.mp4")
    out = os.path.join(ROOT, out_rel)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    ep = load(episode_path)
    run(render_cmd(episode_path, out, ep.get("template", "Descent")), cwd=REMOTION)

    step(5, "Quality checks")
    ep = load(episode_path)  # the voice step may have retimed it
    result = qc(ep, out)
    m = result["measurements"]
    print(f"   {m['width']}x{m['height']}, {m['duration']:.1f}s, {m['lufs']} LUFS, peak {m['true_peak']} dBTP")
    for prob in result["problems"]:
        print(f"   ⚠ {prob}")
    print("   passed" if result["passed"] else "   problems found")

    credits_file = os.path.join(ROOT, "output", "credits", f"{name}.txt")
    credits = open(credits_file, encoding="utf-8").read() if os.path.exists(credits_file) else ""
    yt = ep.get("youtube", {})
    meta = {
        "episode": name,
        "series": ep.get("series", ""),
        "video_path": out_rel.replace("\\", "/"),
        "titles": (yt.get("titles") or [ep.get("title", name)])[:2],
        "description": description(ep, credits),
        "tags": yt.get("tags", []),
        "script": [n["text"] for n in ep.get("narration", [])],
        "sources": ep.get("sources", []),
        "credits": credits.strip(),
        "duration": m["duration"],
        "qc": result,
        "contains_synthetic_media": False,  # animation and narration: YouTube's AI-use question is "No"
    }
    with open(os.path.join(ROOT, "output", "drafts", f"{name}.meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    step(6, "Send for approval")
    if a.no_send:
        print("   skipped (--no-send)")
    elif not result["passed"] and not a.send_anyway:
        print("   not sent because QC found problems. Fix them, or use --send-anyway.")
        sys.exit(1)
    else:
        from scripts.telegram_desk import TelegramApprovalDesk
        TelegramApprovalDesk().send_episode(meta)
    print(f"\nDone in {time.time() - started:.0f}s: {out_rel}")


if __name__ == "__main__":
    main()
