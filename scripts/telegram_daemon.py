"""Background listener for your Telegram taps. Approve schedules the upload, Publish now uploads public,
Reject discards. Only button taps from your own chat are accepted.

Run it in the background with tools/install_daemon.ps1 (starts at logon, restarts if it stops),
or in a terminal:  python scripts/telegram_daemon.py
On GitHub Actions it listens for a few hours per run (--listen MINUTES), saving state to the repo after
every tap and remembering its place in state/telegram_offset.json; --once handles waiting taps and exits.
Only one copy may listen: on GitHub, remove the PC listener (tools\\install_daemon.ps1 -Remove),
or it takes taps that then never reach GitHub.
Commands you can send the bot: /status (drafts waiting and scheduled), /help.
Logs: output/logs/daemon.log
"""
import json
import logging
import os
import subprocess
import sys
import time
from logging.handlers import RotatingFileHandler

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import requests

from scripts import pipeline_state as state
from scripts.env_config import ROOT, load_settings

if sys.stdout and sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

LOG_DIR = os.path.join(ROOT, "output", "logs")
os.makedirs(LOG_DIR, exist_ok=True)
log = logging.getLogger("daemon")
log.setLevel(logging.INFO)
_fh = RotatingFileHandler(os.path.join(LOG_DIR, "daemon.log"), maxBytes=1_000_000, backupCount=3, encoding="utf-8")
_fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
log.addHandler(_fh)
if sys.stdout:
    log.addHandler(logging.StreamHandler(sys.stdout))

HELP = ("I send you each new Short for review.\n"
        "✅ Schedule: uploads it private, and YouTube publishes it at the next free slot.\n"
        "🚀 Publish now: uploads it public straight away.\n"
        "❌ Reject: discards it.\n"
        "/status lists drafts waiting for you and uploads that are scheduled.\n"
        "Taps are picked up within a few seconds.")

STOLEN = ("⚠️ Another copy of this bot is reading your taps, so some of them never reached the pipeline. "
          "It's probably the old PC listener: on that PC run  tools\\install_daemon.ps1 -Remove  "
          "Then tap the button again on any draft that didn't change.")
ON_GITHUB = bool(os.environ.get("GITHUB_ACTIONS"))


class TelegramApprovalDaemon:
    def __init__(self):
        self.settings = load_settings()
        tg = self.settings["telegram"]
        self.chat_id = str(tg["chat_id"])
        self.api = f"https://api.telegram.org/bot{tg['bot_token']}"
        self._publisher = None

    @property
    def publisher(self):
        if self._publisher is None:
            from scripts.youtube_publisher import YouTubePublisher
            self._publisher = YouTubePublisher()
        return self._publisher

    # Telegram helpers -------------------------------------------------------------------------------
    def call(self, method: str, **payload):
        try:
            r = requests.post(f"{self.api}/{method}", json=payload, timeout=30)
            j = r.json()
            if not j.get("ok"):
                log.warning("Telegram %s: %s", method, j.get("description"))
            return j
        except requests.RequestException as e:
            log.warning("Telegram %s failed: %s", method, e)
            return {}

    def set_status(self, msg_id, draft: dict, status_html: str, buttons=None):
        caption = (draft.get("caption") or "").split("\n\n<b>Status")[0]
        text = f"{caption}\n\n<b>Status:</b> {status_html}"[:1024]
        self.call("editMessageCaption", chat_id=self.chat_id, message_id=int(msg_id), caption=text,
                  parse_mode="HTML", reply_markup=buttons or {"inline_keyboard": []})

    # Actions ----------------------------------------------------------------------------------------
    def claim(self, msg_id, action: str, to_status="UPLOADING"):
        """Claims the draft for a tap, or None (already handled, or unknown, which is reported on the phone)."""
        draft = state.claim_draft(msg_id, to_status=to_status)
        # A draft tapped the moment it arrives may not be saved by Produce yet: wait up to 3 minutes for it.
        for _ in range(6 if ON_GITHUB and draft is None and not state.get_draft(msg_id) else 0):
            time.sleep(30)
            pull_state()
            if state.get_draft(msg_id):
                draft = state.claim_draft(msg_id, to_status=to_status)
                break
        if draft is None:
            known = state.get_draft(msg_id)
            if known:
                log.info("Draft %s not %s: already %s", msg_id, action, known.get("status"))
            else:
                log.warning("Draft %s not %s: not in the drafts registry", msg_id, action)
                self.call("sendMessage", chat_id=self.chat_id, reply_to_message_id=int(msg_id),
                          text=f"⚠️ I can't find this draft in the registry, so it wasn't {action}.")
        return draft

    def upload(self, msg_id, which: str, now: bool):
        draft = self.claim(msg_id, "uploaded")
        if draft is None:
            return "Already handled."
        titles = draft.get("titles") or [draft.get("title") or "Untitled"]
        title = titles[1] if which == "b" and len(titles) > 1 else titles[0]
        publish_at = None if now else state.next_publish_slot(self.settings)
        if publish_at:
            state.update_draft(msg_id, scheduled_at=publish_at)
        self.set_status(msg_id, draft, "⏳ uploading to YouTube…",
                        {"inline_keyboard": [[{"text": "⏳ Uploading…", "callback_data": "noop"}]]})
        log.info("Uploading draft %s (%s) title=%r publish_at=%s", msg_id, draft.get("episode"), title, publish_at)
        try:
            fetch_draft_video(draft["video_path"])
            res = self.publisher.upload_short(
                os.path.join(ROOT, draft["video_path"]) if not os.path.isabs(draft["video_path"]) else draft["video_path"],
                title, draft.get("description", ""), draft.get("tags", []),
                privacy_status="public", publish_at=publish_at,
                contains_synthetic_media=draft.get("contains_synthetic_media", False),
                category_id=str(self.settings.get("youtube", {}).get("category_id", "28")),
            )
        except Exception as e:  # noqa: BLE001 - report every failure on the phone and keep the draft
            log.exception("Upload failed for draft %s", msg_id)
            state.update_draft(msg_id, status="FAILED", error=str(e)[:500], scheduled_at=None)
            from scripts.telegram_desk import review_buttons
            self.set_status(msg_id, draft, f"⚠️ upload failed: {state_escape(str(e))[:300]}. Tap a button to retry.",
                            review_buttons())
            return "Upload failed. Details are on the message."

        status = "SCHEDULED" if publish_at else "PUBLISHED"
        state.update_draft(msg_id, status=status, title_used=title, video_id=res["video_id"],
                           youtube_url=res["url"], scheduled_at=publish_at)
        when = f"goes public {state.fmt_local(publish_at, self.settings)}" if publish_at else "live now"
        note = f"\n⚠️ {state_escape(res['warning'])}" if res.get("warning") else ""
        self.set_status(msg_id, draft, f"✅ uploaded, {when}.\n<b>Title:</b> {state_escape(title)}{note}",
                        {"inline_keyboard": [[{"text": "▶️ Open on YouTube", "url": res["url"]},
                                              {"text": "✏️ Studio", "url": res["studio_url"]}]]})
        log.info("Draft %s %s: %s", msg_id, status, res["url"])
        return "Uploaded and scheduled." if publish_at else "Uploaded, live now."

    def reject(self, msg_id):
        draft = self.claim(msg_id, "rejected", to_status="REJECTED")
        if draft is None:
            return "Already handled."
        self.set_status(msg_id, draft, "❌ rejected.")
        log.info("Draft %s rejected", msg_id)
        return "Discarded."

    def status_text(self) -> str:
        drafts = state.all_drafts()
        waiting = [d for d in drafts.values() if d.get("status") in ("PENDING", "FAILED")]
        sched = sorted((d for d in drafts.values() if d.get("status") == "SCHEDULED" and d.get("scheduled_at")),
                       key=lambda d: d["scheduled_at"])
        lines = [f"<b>Waiting for you:</b> {len(waiting)}"]
        lines += [f"• {state_escape(d.get('episode') or d.get('title', '?'))} ({d['status'].lower()})" for d in waiting[:10]]
        lines += ["", f"<b>Scheduled:</b> {len(sched)}"]
        lines += [f"• {state.fmt_local(d['scheduled_at'], self.settings)}: {state_escape(d.get('title_used', ''))}"
                  for d in sched[:10]]
        return "\n".join(lines)

    # Main loop --------------------------------------------------------------------------------------
    def handle(self, update: dict):
        if "callback_query" in update:
            cq = update["callback_query"]
            log.info("Tap: %r on message %s from %s", cq.get("data"), cq.get("message", {}).get("message_id"),
                     "you" if str(cq.get("from", {}).get("id")) == self.chat_id else "someone else (ignored)")
            if str(cq.get("from", {}).get("id")) != self.chat_id:
                return
            data = cq.get("data", "")
            msg_id = cq.get("message", {}).get("message_id")
            if data == "noop" or msg_id is None:
                self.call("answerCallbackQuery", callback_query_id=cq["id"])
                return
            # Answer straight away so the button stops spinning; the upload can take a minute.
            self.call("answerCallbackQuery", callback_query_id=cq["id"],
                      text="Got it…" if data != "reject" else "Discarding…")
            if data.startswith("approve:"):
                self.upload(msg_id, data.split(":")[1], now=False)
            elif data.startswith("now:"):
                self.upload(msg_id, data.split(":")[1], now=True)
            elif data == "reject":
                self.reject(msg_id)
            elif data in ("action_approve", "action_reject"):  # cards sent by the old pipeline
                if data == "action_reject":
                    self.reject(msg_id)
                else:
                    self.upload(msg_id, "a", now=False)
        elif "message" in update:
            m = update["message"]
            log.info("Message: %r", (m.get("text") or "")[:40])
            if str(m.get("chat", {}).get("id")) != self.chat_id:
                return
            text = (m.get("text") or "").strip().lower()
            if text.startswith("/status"):
                self.call("sendMessage", chat_id=self.chat_id, text=self.status_text(), parse_mode="HTML")
            elif text.startswith("/help") or text.startswith("/start"):
                self.call("sendMessage", chat_id=self.chat_id, text=HELP)

    def poll(self, offset, timeout: int) -> list | None:
        """One getUpdates call; None when it failed (already logged)."""
        params = {"timeout": timeout, "allowed_updates": json.dumps(["callback_query", "message"])}
        if offset is not None:
            params["offset"] = offset
        try:
            r = requests.get(f"{self.api}/getUpdates", params=params, timeout=timeout + 20)
            j = r.json()
        except (requests.RequestException, ValueError) as e:
            log.warning("Network problem: %s", e)
            return None
        if r.status_code == 409:
            # Another copy is long-polling (or a webhook is set): it will take taps meant for us.
            log.warning("Telegram 409: %s", j.get("description"))
            self.warn_stolen()
            return None
        if not j.get("ok"):
            log.warning("getUpdates: %s", j.get("description"))
            return None
        return j.get("result", [])

    def warn_stolen(self):
        if not getattr(self, "_warned", False):
            self._warned = True
            self.call("sendMessage", chat_id=self.chat_id, text=STOLEN)

    def handle_batch(self, updates: list, offset, offset_file: str, warn_gaps: bool = True):
        """Handles updates in order, saving the offset after each one, so a crash never repeats an upload.

        Update ids are sequential, so a gap means something else read those updates. A gap on a run's first
        poll is only logged: it covers the time before this run, e.g. taps the PC listener took before removal."""
        for upd in updates:
            if offset is not None and upd["update_id"] > offset:
                log.warning("Updates %s to %s were read by something else.", offset, upd["update_id"] - 1)
                if warn_gaps:
                    self.warn_stolen()
            offset = upd["update_id"] + 1
            try:
                self.handle(upd)
            except Exception:  # noqa: BLE001
                log.exception("Error handling update %s", upd.get("update_id"))
            os.makedirs(os.path.dirname(offset_file), exist_ok=True)
            with open(offset_file, "w", encoding="utf-8") as f:
                json.dump({"offset": offset}, f)
        return offset

    def run_once(self, offset_file: str):
        """Handles the taps waiting since the last check, then exits."""
        updates = self.poll(read_offset(offset_file), timeout=0)
        if updates is None:
            raise SystemExit("getUpdates failed (see above)")
        log.info("Checked Telegram: %d new update(s).", len(updates))
        self.handle_batch(updates, read_offset(offset_file), offset_file, warn_gaps=False)

    def run_listen(self, offset_file: str, minutes: float):
        """Listens for taps for a while (one GitHub run), saving state to the repo after each batch."""
        deadline = time.time() + minutes * 60
        log.info("Listening for taps for %.0f minutes.", minutes)
        first = True
        while time.time() < deadline - 60:
            offset = read_offset(offset_file)
            updates = self.poll(offset, timeout=50)
            if updates is None:
                time.sleep(30)
                continue
            if not updates:
                first = False
                continue
            log.info("%d new update(s).", len(updates))
            pull_state()  # drafts produced since this run started
            self.handle_batch(updates, read_offset(offset_file), offset_file, warn_gaps=not first)
            first = False
            push_state()
        log.info("Done listening.")

    def run(self):
        log.info("Approval daemon started; listening for taps.")
        offset = None
        while True:
            try:
                params = {"timeout": 50, "allowed_updates": json.dumps(["callback_query", "message"])}
                if offset is not None:
                    params["offset"] = offset
                r = requests.get(f"{self.api}/getUpdates", params=params, timeout=60)
                j = r.json()
                if r.status_code == 409:
                    log.warning("Another copy of the daemon is running (Telegram 409). Retrying in 30s.")
                    time.sleep(30)
                    continue
                if not j.get("ok"):
                    log.warning("getUpdates: %s", j.get("description"))
                    time.sleep(5)
                    continue
                for upd in j.get("result", []):
                    offset = upd["update_id"] + 1
                    try:
                        self.handle(upd)
                    except Exception:  # noqa: BLE001 - one bad update must not stop the daemon
                        log.exception("Error handling update %s", upd.get("update_id"))
            except requests.RequestException as e:
                log.warning("Network problem: %s; retrying in 10s", e)
                time.sleep(10)


def read_offset(offset_file: str):
    if not os.path.exists(offset_file):
        return None
    with open(offset_file, "r", encoding="utf-8") as f:
        return json.load(f).get("offset")


def git(*args) -> bool:
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    if r.returncode:
        log.warning("git %s failed: %s", args[0], (r.stderr or r.stdout).strip()[:300])
    return r.returncode == 0


def pull_state() -> None:
    """On GitHub, brings in drafts and state saved by other runs (state/*.json merges via merge_state.py)."""
    if ON_GITHUB and not git("pull", "-q", "--rebase", "--autostash"):
        git("rebase", "--abort")


def push_state() -> None:
    """On GitHub, commits and pushes state/ so taps are saved as they happen; retried at the next tap if it fails."""
    if not ON_GITHUB:
        return
    git("add", "-A", "state")
    if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT).returncode == 0:
        return
    git("commit", "-q", "-m", "Approvals: update drafts [skip ci]")
    for _ in range(3):
        if git("pull", "-q", "--rebase") and git("push", "-q"):
            return
        git("rebase", "--abort")
        time.sleep(5)


def fetch_draft_video(video_path: str) -> None:
    """On GitHub the rendered drafts are kept as files on the repo's "drafts" release; download one when needed."""
    full = video_path if os.path.isabs(video_path) else os.path.join(ROOT, video_path)
    if os.path.exists(full) or not os.environ.get("GITHUB_ACTIONS"):
        return
    import subprocess
    os.makedirs(os.path.dirname(full), exist_ok=True)
    subprocess.run(["gh", "release", "download", "drafts", "-p", os.path.basename(full),
                    "-D", os.path.dirname(full), "--clobber"], check=True)


def state_escape(s: str) -> str:
    import html
    return html.escape(str(s or ""), quote=False)


if __name__ == "__main__":
    OFFSET_FILE = os.path.join(ROOT, "state", "telegram_offset.json")
    if "--once" in sys.argv:
        TelegramApprovalDaemon().run_once(OFFSET_FILE)
    elif "--listen" in sys.argv:
        TelegramApprovalDaemon().run_listen(OFFSET_FILE, float(sys.argv[sys.argv.index("--listen") + 1]))
    else:
        TelegramApprovalDaemon().run()
