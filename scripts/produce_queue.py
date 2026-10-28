"""Produces every episode waiting in remotion/episodes/queue/, one after another.

The daily scheduled task writes a new episode there each morning; tools/install_producer.ps1 runs this
script on a schedule (and at log-on), so each one is voiced, rendered, checked and sent to Telegram.

For each queued file:
  1. checks it with validate_episode.py;
  2. moves it to remotion/episodes/ and runs produce.py on it;
  3. on any problem, moves it to remotion/episodes/queue/failed/ and sends you a Telegram message saying why.
Logs go to output/logs/producer.log. Run it by hand any time:
    python scripts/produce_queue.py
"""
import json
import os
import shutil
import subprocess
import sys
import time
import traceback

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from scripts.env_config import ROOT, load_dotenv
from scripts.validate_episode import validate

if sys.stdout is not None and sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

QUEUE = os.path.join(ROOT, "remotion", "episodes", "queue")
FAILED = os.path.join(QUEUE, "failed")
EPISODES = os.path.join(ROOT, "remotion", "episodes")
LOG_DIR = os.path.join(ROOT, "output", "logs")
LOG = os.path.join(LOG_DIR, "producer.log")
LOCK = os.path.join(LOG_DIR, "producer.lock")
NO_WINDOW = 0x08000000 if os.name == "nt" else 0  # keep render windows from popping up


def log(msg: str) -> None:
    os.makedirs(LOG_DIR, exist_ok=True)
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')}  {msg}"
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    if sys.stdout is not None:
        print(line)


def notify(text: str) -> None:
    try:
        from scripts.telegram_desk import TelegramApprovalDesk
        desk = TelegramApprovalDesk()
        desk._post("sendMessage", json={"chat_id": desk.chat_id, "text": text[:3900]})
    except Exception as e:  # noqa: BLE001 - a failed notice must not hide the real problem
        log(f"could not send Telegram notice: {e}")


def console_python() -> str:
    """python.exe rather than pythonw.exe, so produce.py's output can be captured into the log."""
    exe = sys.executable
    if os.path.basename(exe).lower() == "pythonw.exe":
        alt = os.path.join(os.path.dirname(exe), "python.exe")
        if os.path.exists(alt):
            return alt
    return exe


def fail(name: str, path: str, why: str) -> None:
    os.makedirs(FAILED, exist_ok=True)
    if os.path.exists(path):
        shutil.move(path, os.path.join(FAILED, os.path.basename(path)))
    log(f"FAILED {name}: {why}")
    notify(f"⚠ Daily episode '{name}' wasn't produced.\n\n{why}\n\n"
           f"The file is in remotion/episodes/queue/failed/. Details: output/logs/producer.log")


def produce_one(path: str) -> None:
    name = os.path.splitext(os.path.basename(path))[0]
    try:
        with open(path, "r", encoding="utf-8") as f:
            ep = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        fail(name, path, f"Can't read the episode file: {e}")
        return
    problems = validate(ep, path)
    if problems:
        fail(name, path, "The episode file has problems:\n- " + "\n- ".join(problems))
        return
    target = os.path.join(EPISODES, os.path.basename(path))
    if os.path.exists(target):
        fail(name, path, f"An episode called {name} already exists; rename the queued file.")
        return
    shutil.move(path, target)
    log(f"producing {name}")
    with open(LOG, "a", encoding="utf-8") as out:
        r = subprocess.run([console_python(), os.path.join("scripts", "produce.py"), target],
                           cwd=ROOT, stdout=out, stderr=subprocess.STDOUT, creationflags=NO_WINDOW)
    if os.environ.get("GITHUB_ACTIONS"):
        print(open(LOG, encoding="utf-8").read()[-20000:])
    if r.returncode != 0:
        # Keep the file where produce.py left it (voice and timings may be done), so a rerun picks up from there.
        log(f"FAILED {name}: produce.py exited with {r.returncode}")
        notify(f"⚠ Daily episode '{name}' failed while producing (exit {r.returncode}).\n"
               f"Rerun with: python scripts\\produce.py remotion\\episodes\\{name}.json\n"
               f"Details: output/logs/producer.log")
        return
    log(f"done {name}")


def main():
    load_dotenv()
    os.makedirs(LOG_DIR, exist_ok=True)
    try:
        fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        if time.time() - os.path.getmtime(LOCK) < 3 * 3600:
            log("another producer run is in progress; skipping")
            return
        os.remove(LOCK)
        fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    try:
        os.makedirs(QUEUE, exist_ok=True)
        queued = sorted(os.path.join(QUEUE, f) for f in os.listdir(QUEUE) if f.endswith(".json"))
        if not queued:
            log("queue empty")
            return
        for path in queued:
            try:
                produce_one(path)
            except Exception:  # noqa: BLE001
                fail(os.path.basename(path), path, traceback.format_exc(limit=3))
    finally:
        os.close(fd)
        os.remove(LOCK)


if __name__ == "__main__":
    main()
