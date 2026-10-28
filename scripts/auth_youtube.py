import os
import sys
import pickle
import subprocess

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from google_auth_oauthlib.flow import InstalledAppFlow
from scripts.env_config import google_client_config

if sys.stdout is not None and sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding='utf-8')

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
CONFIG_DIR = os.path.join(os.path.dirname(__file__), "..", "config")
CLIENT_SECRETS_FILE = os.path.join(CONFIG_DIR, "client_secret.json")
TOKEN_PICKLE_FILE = os.path.join(CONFIG_DIR, "youtube_token.pickle")

class AutoLaunchFlow(InstalledAppFlow):
    def authorization_url(self, **kwargs):
        url, state = super().authorization_url(**kwargs)
        # Save exact URL
        link_path = os.path.join(CONFIG_DIR, "auth_url.txt")
        with open(link_path, "w", encoding="utf-8") as f:
            f.write(url)
            
        print("\n" + "="*60, flush=True)
        print("AUTH_LINK:\n" + url, flush=True)
        print("="*60 + "\n", flush=True)
        
        # Pop browser
        try:
            subprocess.run(["powershell", "-c", f'Start-Process "{url}"'], check=False)
        except Exception:
            pass
            
        return url, state

def main():
    flow = AutoLaunchFlow.from_client_config(
        google_client_config(),
        SCOPES
    )
    
    print("Starting local OAuth listener on http://localhost:8080/ ...", flush=True)
    credentials = flow.run_local_server(
        port=8080,
        prompt="consent",
        access_type="offline",
        open_browser=False
    )
    
    with open(TOKEN_PICKLE_FILE, "wb") as token:
        pickle.dump(credentials, token)
        
    print("\n🎉 SUCCESS: YouTube authorization token saved to config/youtube_token.pickle!", flush=True)

if __name__ == "__main__":
    main()
