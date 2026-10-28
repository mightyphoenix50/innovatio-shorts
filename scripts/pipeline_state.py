"""Shared state for the approval pipeline: the drafts registry and the publish schedule.

The registry (output/pending_drafts.json) maps a Telegram message id to one draft:
  status: PENDING -> UPLOADING -> SCHEDULED / PUBLISHED, or REJECTED; FAILED keeps the buttons for a retry.
Writes go through a lock file, so produce.py and the approval daemon never overwrite each other.
"""
import json
import os
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# On GitHub Actions the registry lives in state/ and is committed back after each run (DRAFTS_REGISTRY).
REGISTRY = os.path.join(ROOT, os.environ.get("DRAFTS_REGISTRY", os.path.join("output", "pending_drafts.json")))
LOCK = REGISTRY + ".lock"


@contextmanager
def _locked(timeout: float = 15.0):
    os.makedirs(os.path.dirname(REGISTRY), exist_ok=True)
    deadline = time.time() + timeout
    while True:
        try:
            fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            break
        except FileExistsError:
            # A lock older than a minute was left by a crash: take it over.
            try:
                if time.time() - os.path.getmtime(LOCK) > 60:
                    os.remove(LOCK)
                    continue
            except FileNotFoundError:
                continue
            if time.time() > deadline:
                raise TimeoutError("drafts registry is locked")
            time.sleep(0.1)
    try:
        yield
    finally:
        os.close(fd)
        try:
            os.remove(LOCK)
        except FileNotFoundError:
            pass


def _read() -> dict:
    if not os.path.exists(REGISTRY):
        return {}
    with open(REGISTRY, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}


def _write(data: dict) -> None:
    tmp = REGISTRY + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, REGISTRY)


def all_drafts() -> dict:
    with _locked():
        return _read()


def get_draft(message_id) -> dict:
    return all_drafts().get(str(message_id), {})


def put_draft(message_id, draft: dict) -> None:
    with _locked():
        data = _read()
        data[str(message_id)] = draft
        _write(data)


def update_draft(message_id, **fields) -> dict:
    with _locked():
        data = _read()
        d = data.get(str(message_id), {})
        d.update(fields)
        d["updated_at"] = time.time()
        data[str(message_id)] = d
        _write(data)
        return d


def claim_draft(message_id, from_statuses=("PENDING", "FAILED"), to_status="UPLOADING") -> dict | None:
    """Atomically moves a draft into to_status; None if it was already handled (a double tap)."""
    with _locked():
        data = _read()
        d = data.get(str(message_id))
        if not d or d.get("status") not in from_statuses:
            return None
        d["status"] = to_status
        d["updated_at"] = time.time()
        _write(data)
        return d


def local_tz(settings: dict) -> timezone:
    hours = float(settings.get("youtube", {}).get("display_utc_offset_hours", 2))
    return timezone(timedelta(hours=hours))


def fmt_local(iso_utc: str, settings: dict) -> str:
    t = datetime.fromisoformat(iso_utc.replace("Z", "+00:00")).astimezone(local_tz(settings))
    return t.strftime("%a %d %b, %H:%M")


def next_publish_slot(settings: dict, now: datetime | None = None) -> str:
    """Next free daily slot (settings.youtube.publish_slots_utc, default 16:00 UTC), at least an hour away.

    A slot is taken when a SCHEDULED or UPLOADING draft already has it. Returns an ISO time in UTC."""
    yt = settings.get("youtube", {})
    slots = yt.get("publish_slots_utc") or ["16:00"]
    lead = timedelta(minutes=int(yt.get("min_lead_minutes", 60)))
    now = now or datetime.now(timezone.utc)
    taken = {d.get("scheduled_at") for d in all_drafts().values()
             if d.get("status") in ("SCHEDULED", "UPLOADING") and d.get("scheduled_at")}
    for day in range(0, 60):
        date = (now + timedelta(days=day)).date()
        for s in sorted(slots):
            hh, mm = (int(x) for x in s.split(":"))
            t = datetime(date.year, date.month, date.day, hh, mm, tzinfo=timezone.utc)
            iso = t.strftime("%Y-%m-%dT%H:%M:%SZ")
            if t >= now + lead and iso not in taken:
                return iso
    raise RuntimeError("no free publish slot in the next 60 days")
