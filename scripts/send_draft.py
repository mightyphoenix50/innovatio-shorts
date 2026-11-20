"""Send a pre-rendered Short from the GitHub 'drafts' release to Telegram for approval.

Registers the draft in state/pending_drafts.json so telegram_daemon.py can handle
Schedule / Publish now / Reject taps just like a pipeline-produced episode.
"""
import argparse
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from scripts.env_config import ROOT
from scripts.telegram_desk import TelegramApprovalDesk


def probe_video(path: str) -> dict:
    r = subprocess.run(
        [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    info = json.loads(r.stdout)
    vstream = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), {})
    duration = float(info.get("format", {}).get("duration") or vstream.get("duration") or 0)
    return {
        "width": int(vstream.get("width") or 1080),
        "height": int(vstream.get("height") or 1920),
        "duration": duration,
    }


def main():
    p = argparse.ArgumentParser(description="Send a pre-rendered draft video to Telegram for approval.")
    p.add_argument("--asset", required=True, help="MP4 filename in output/drafts/ (or the GitHub 'drafts' release)")
    p.add_argument("--episode", required=True, help="Episode slug (e.g. dynamite-vs-donut)")
    p.add_argument("--series", default="Physics", help="Series label shown in Telegram caption")
    p.add_argument("--title-a", required=True, help="Primary YouTube title (option A)")
    p.add_argument("--title-b", default="", help="Alternate YouTube title (option B)")
    p.add_argument("--description", default="", help="YouTube video description")
    p.add_argument("--tags", default="", help="Comma-separated YouTube tags")
    p.add_argument("--script", default="", help="Optional newline-separated script lines for the reply message")
    a = p.parse_args()

    out_rel = os.path.join("output", "drafts", os.path.basename(a.asset)).replace("\\", "/")
    out_abs = os.path.join(ROOT, out_rel)
    if not os.path.exists(out_abs):
        os.makedirs(os.path.dirname(out_abs), exist_ok=True)
        subprocess.run(
            ["gh", "release", "download", "drafts", "-p", os.path.basename(a.asset),
             "-D", os.path.dirname(out_abs), "--clobber"],
            check=True,
        )

    m = probe_video(out_abs)
    titles = [a.title_a.strip()]
    if a.title_b.strip():
        titles.append(a.title_b.strip())
    tags = [t.strip() for t in a.tags.split(",") if t.strip()]
    script_lines = [line.strip() for line in a.script.splitlines() if line.strip()]

    meta = {
        "episode": a.episode.strip(),
        "series": a.series.strip(),
        "video_path": out_rel,
        "titles": titles,
        "description": a.description.strip(),
        "tags": tags,
        "script": script_lines,
        "sources": [],
        "credits": "",
        "duration": m["duration"],
        "qc": {
            "passed": True,
            "problems": [],
            "measurements": {
                "width": m["width"],
                "height": m["height"],
                "duration": m["duration"],
                "lufs": "n/a",
                "true_peak": "n/a",
            },
        },
        "contains_synthetic_media": False,
    }

    TelegramApprovalDesk().send_episode(meta)


if __name__ == "__main__":
    main()
