"""Git merge driver for state/*.json, so Produce and the Telegram listener can both save state without conflicts.

Registered in .gitattributes (state/*.json merge=state) and enabled by each workflow with:
  git config merge.state.driver "python scripts/merge_state.py %O %A %B"
Drafts registry: keeps every draft, and where both sides changed one, the side that changed it last.
Telegram offset: keeps the higher one, so a tap is never handled twice.
Git passes the ancestor, ours and theirs; the result goes into ours.
"""
import json
import sys


def load(path: str) -> dict:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def stamp(draft: dict) -> float:
    return max(float(draft.get(k) or 0) for k in ("updated_at", "created_at", "timestamp"))


def main(_base: str, ours_path: str, theirs_path: str) -> None:
    ours, theirs = load(ours_path), load(theirs_path)
    if "offset" in ours or "offset" in theirs:
        merged = {"offset": max(ours.get("offset") or 0, theirs.get("offset") or 0)}
        text = json.dumps(merged)
    else:
        merged = dict(ours)
        for key, draft in theirs.items():
            if key not in ours or stamp(draft) > stamp(ours[key]):
                merged[key] = draft
        text = json.dumps(merged, indent=2, ensure_ascii=False)
    with open(ours_path, "w", encoding="utf-8") as f:
        f.write(text)


if __name__ == "__main__":
    main(*sys.argv[1:4])
