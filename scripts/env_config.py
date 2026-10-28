"""Loads secrets from the project's .env file and merges them with config/settings.json.

Secrets (Telegram token, chat ID, Google OAuth client) live only in .env.
settings.json keeps the non-secret channel settings.
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENV_PATH = os.path.join(ROOT, ".env")
SETTINGS_PATH = os.path.join(ROOT, "config", "settings.json")
LEGACY_CLIENT_SECRET = os.path.join(ROOT, "config", "client_secret.json")


def load_dotenv(path: str = ENV_PATH) -> None:
    """Minimal .env parser: KEY=VALUE lines, # comments, optional quotes. Existing env vars win."""
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key, value = key.strip(), value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            os.environ.setdefault(key, value)


def _require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing {name}. Add it to {ENV_PATH} (see .env.example).")
    return value


def load_settings(path: str = SETTINGS_PATH) -> dict:
    """settings.json plus the Telegram secrets from .env, in the same shape the scripts expect."""
    load_dotenv()
    with open(path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    cfg["telegram"] = {
        "bot_token": _require("TELEGRAM_BOT_TOKEN"),
        "chat_id": _require("TELEGRAM_CHAT_ID"),
    }
    return cfg


def google_client_config() -> dict:
    """OAuth client config for InstalledAppFlow.from_client_config(), built from .env."""
    load_dotenv()
    if not os.environ.get("GOOGLE_CLIENT_ID") and os.path.exists(LEGACY_CLIENT_SECRET):
        with open(LEGACY_CLIENT_SECRET, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "installed": {
            "client_id": _require("GOOGLE_CLIENT_ID"),
            "client_secret": _require("GOOGLE_CLIENT_SECRET"),
            "project_id": os.environ.get("GOOGLE_PROJECT_ID", ""),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "redirect_uris": ["http://localhost"],
        }
    }
