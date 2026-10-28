"""Copies the pipeline's keys from your local .env (and YouTube login) into the GitHub repo's encrypted secrets.

Run once on the computer that has the project's .env, from the project folder:
    python tools\\github_secrets.py

With the GitHub CLI installed and logged in (`gh auth login`), it sets every secret for you.
Without it, it prints each name and value so you can paste them into
https://github.com/mightyphoenix50/innovatio-shorts/settings/secrets/actions  (New repository secret).
The values only ever appear on your own screen; nothing is written to disk.
"""
import os
import pickle
import shutil
import subprocess
import sys

REPO = "mightyphoenix50/innovatio-shorts"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
NAMES = ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
         "FREESOUND_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]


def read_env() -> dict:
    env = {}
    with open(os.path.join(ROOT, ".env"), "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                v = v.strip()
                if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                    v = v[1:-1]
                env[k.strip()] = v
    return env


def youtube_refresh_token() -> str:
    path = os.path.join(ROOT, "config", "youtube_token.pickle")
    with open(path, "rb") as f:
        creds = pickle.load(f)
    if not getattr(creds, "refresh_token", None):
        raise SystemExit("The YouTube login has no refresh token. Run python scripts\\auth_youtube.py, then try again.")
    return creds.refresh_token


def main():
    env = read_env()
    secrets = {n: env.get(n, "") for n in NAMES}
    secrets["YOUTUBE_REFRESH_TOKEN"] = youtube_refresh_token()
    missing = [n for n, v in secrets.items() if not v and n != "AZURE_SPEECH_REGION"]
    if missing:
        print("Missing from .env:", ", ".join(missing))
    if not secrets["AZURE_SPEECH_REGION"]:
        secrets["AZURE_SPEECH_REGION"] = "southafricanorth"

    gh = shutil.which("gh")
    if gh and subprocess.run([gh, "auth", "status"], capture_output=True).returncode == 0:
        for name, value in secrets.items():
            if not value:
                continue
            r = subprocess.run([gh, "secret", "set", name, "--repo", REPO], input=value, text=True, capture_output=True)
            print(("✓ " if r.returncode == 0 else "✗ ") + name + ("" if r.returncode == 0 else f": {r.stderr.strip()}"))
        print("\nDone. You can close this window.")
        return

    print(f"GitHub CLI not found (or not logged in), so add these by hand at\n"
          f"https://github.com/{REPO}/settings/secrets/actions  →  New repository secret\n")
    for name, value in secrets.items():
        if value:
            print(f"{name}\n{value}\n")
    input("Press Enter to clear the screen when you're done...")
    os.system("cls" if os.name == "nt" else "clear")


if __name__ == "__main__":
    main()
