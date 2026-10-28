"""Sends a finished Short to your phone for review: the video, two title options, QC results, then the script,
sources and credits as a reply. The buttons are handled by telegram_daemon.py.

Buttons (callback data):
  approve:a / approve:b   upload private, scheduled for the next free publish slot, with title A or B
  now:a                   upload public right away with title A
  reject                  discard the draft
"""
import html
import json
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import requests

from scripts import pipeline_state as state
from scripts.env_config import ROOT, load_settings

if sys.stdout is not None and sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

CAPTION_LIMIT = 1024
TEXT_LIMIT = 4096


def esc(s) -> str:
    return html.escape(str(s or ""), quote=False)


def review_buttons() -> dict:
    return {"inline_keyboard": [
        [{"text": "✅ Schedule with title A", "callback_data": "approve:a"},
         {"text": "✅ Schedule with title B", "callback_data": "approve:b"}],
        [{"text": "🚀 Publish now (A)", "callback_data": "now:a"},
         {"text": "❌ Reject", "callback_data": "reject"}],
    ]}


def build_caption(meta: dict, slot_text: str) -> str:
    qc = meta.get("qc", {})
    qc_line = "✅ QC passed" if qc.get("passed") else "⚠️ QC: " + "; ".join(qc.get("problems", []))[:300]
    titles = meta["titles"]
    cap = (
        f"🎬 <b>New Short ready for review</b>\n"
        f"<i>{esc(meta.get('series', ''))} · {esc(meta['episode'])} · {meta.get('duration', 0):.0f}s</i>\n\n"
        f"<b>A:</b> {esc(titles[0])}\n"
        f"<b>B:</b> {esc(titles[1] if len(titles) > 1 else titles[0])}\n\n"
        f"{qc_line}\n"
        f"📅 Approving schedules it for <b>{esc(slot_text)}</b>\n"
        f"Script, sources and credits are in the reply below."
    )
    return cap[:CAPTION_LIMIT]


def build_details(meta: dict) -> str:
    lines = ["<b>Script</b>"]
    lines += [f"• {esc(n)}" for n in meta.get("script", [])]
    if meta.get("sources"):
        lines += ["", "<b>Sources</b>"]
        lines += [f"• {esc(s['claim'])}: {esc(s['url'])}" for s in meta["sources"]]
    if meta.get("credits"):
        lines += ["", "<b>Credits</b> (go in the description automatically)", esc(meta["credits"])]
    qc = meta.get("qc", {})
    if qc.get("measurements"):
        m = qc["measurements"]
        lines += ["", f"<b>QC</b> {m.get('width')}×{m.get('height')}, {m.get('duration', 0):.1f}s, "
                      f"{m.get('lufs')} LUFS, peak {m.get('true_peak')} dBTP"]
    text = "\n".join(lines)
    return text if len(text) <= TEXT_LIMIT else text[: TEXT_LIMIT - 1] + "…"


class TelegramApprovalDesk:
    def __init__(self):
        self.settings = load_settings()
        tg = self.settings["telegram"]
        self.chat_id = str(tg["chat_id"])
        self.api = f"https://api.telegram.org/bot{tg['bot_token']}"

    def _post(self, method: str, timeout: int = 60, **kw) -> dict:
        r = requests.post(f"{self.api}/{method}", timeout=timeout, **kw)
        j = r.json()
        if not j.get("ok"):
            raise RuntimeError(f"Telegram {method} failed: {j.get('description')}")
        return j["result"]

    def send_episode(self, meta: dict) -> int:
        """meta comes from produce.py. Returns the Telegram message id the draft is registered under."""
        video = meta["video_path"] if os.path.isabs(meta["video_path"]) else os.path.join(ROOT, meta["video_path"])
        if not os.path.exists(video):
            raise FileNotFoundError(video)
        slot = state.next_publish_slot(self.settings)
        caption = build_caption(meta, state.fmt_local(slot, self.settings))
        print(f"Sending {os.path.basename(video)} to Telegram...")
        with open(video, "rb") as vf:
            msg = self._post("sendVideo", timeout=300, data={
                "chat_id": self.chat_id, "caption": caption, "parse_mode": "HTML",
                "supports_streaming": True, "width": 1080, "height": 1920,
                "duration": int(meta.get("duration") or 0),
                "reply_markup": json.dumps(review_buttons()),
            }, files={"video": vf})
        message_id = msg["message_id"]
        try:
            self._post("sendMessage", json={
                "chat_id": self.chat_id, "text": build_details(meta), "parse_mode": "HTML",
                "reply_to_message_id": message_id, "disable_web_page_preview": True,
            })
        except RuntimeError as e:
            print(f"[warn] details message not sent: {e}")
        state.put_draft(message_id, {
            **{k: meta[k] for k in ("episode", "video_path", "titles", "description", "tags") if k in meta},
            "contains_synthetic_media": bool(meta.get("contains_synthetic_media", False)),
            "caption": caption,
            "status": "PENDING",
            "created_at": time.time(),
        })
        print(f"[OK] Sent for review (message {message_id}).")
        return message_id


if __name__ == "__main__":
    TelegramApprovalDesk()
    print("Telegram desk OK.")
