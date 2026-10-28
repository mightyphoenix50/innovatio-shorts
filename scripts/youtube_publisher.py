"""Uploads a vertical video to YouTube as a Short, either public now or private with a scheduled publish time.

Credentials come from .env (Google OAuth client) and config/youtube_token.pickle (your channel's login).
Re-run scripts/auth_youtube.py if the login ever expires.
"""
import os
import pickle
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

if sys.stdout is not None and sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


class YouTubePublisher:
    def __init__(self, config_dir=None):
        if not config_dir:
            config_dir = os.path.join(os.path.dirname(__file__), "..", "config")
        self.token_pickle_file = os.path.join(config_dir, "youtube_token.pickle")
        self.credentials = None

    def authenticate(self):
        """Loads the saved login, refreshes it when expired, or opens the browser once to log in.

        On GitHub Actions the login comes from YOUTUBE_REFRESH_TOKEN plus GOOGLE_CLIENT_ID/SECRET instead."""
        if os.environ.get("YOUTUBE_REFRESH_TOKEN"):
            from google.oauth2.credentials import Credentials
            self.credentials = Credentials(
                None, refresh_token=os.environ["YOUTUBE_REFRESH_TOKEN"],
                client_id=os.environ["GOOGLE_CLIENT_ID"], client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
                token_uri="https://oauth2.googleapis.com/token", scopes=SCOPES)
            self.credentials.refresh(Request())
            return build("youtube", "v3", credentials=self.credentials, cache_discovery=False)
        if os.path.exists(self.token_pickle_file):
            with open(self.token_pickle_file, "rb") as token:
                self.credentials = pickle.load(token)

        if not self.credentials or not self.credentials.valid:
            if self.credentials and self.credentials.expired and self.credentials.refresh_token:
                print("Refreshing the YouTube login...")
                self.credentials.refresh(Request())
            else:
                from scripts.env_config import google_client_config
                print("Opening the browser for a one-time YouTube login...")
                flow = InstalledAppFlow.from_client_config(google_client_config(), SCOPES)
                self.credentials = flow.run_local_server(port=0)
            with open(self.token_pickle_file, "wb") as token:
                pickle.dump(self.credentials, token)

        return build("youtube", "v3", credentials=self.credentials, cache_discovery=False)

    def upload_short(
        self,
        video_path: str,
        title: str,
        description: str,
        tags: list = None,
        privacy_status: str = "public",
        publish_at: str | None = None,
        contains_synthetic_media: bool = False,
        category_id: str = "28",
        notify_subscribers: bool = True,
    ) -> dict:
        """Uploads the video. With publish_at (ISO UTC, e.g. 2026-10-28T16:00:00Z) it goes up private and
        YouTube makes it public at that time. contains_synthetic_media answers YouTube's "AI use" question:
        only True for realistic AI footage, not for animation or a narrated script."""
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")

        youtube = self.authenticate()
        status = {
            "privacyStatus": "private" if publish_at else privacy_status,
            "selfDeclaredMadeForKids": False,
            "containsSyntheticMedia": bool(contains_synthetic_media),
        }
        if publish_at:
            status["publishAt"] = publish_at
        body = {
            "snippet": {
                "title": title[:100],
                "description": description[:5000],
                "tags": (tags or [])[:30],
                "categoryId": category_id,
                "defaultLanguage": "en",
            },
            "status": status,
        }

        media = MediaFileUpload(video_path, mimetype="video/mp4", resumable=True, chunksize=4 * 1024 * 1024)
        print(f"Uploading '{title}' to YouTube...")
        request = youtube.videos().insert(
            part="snippet,status", body=body, media_body=media, notifySubscribers=notify_subscribers
        )
        response = None
        retries = 0
        while response is None:
            try:
                progress, response = request.next_chunk()
                if progress:
                    print(f"  {int(progress.progress() * 100)}%")
            except HttpError as e:
                if e.resp.status in (500, 502, 503, 504) and retries < 5:
                    retries += 1
                    continue
                raise

        video_id = response.get("id")
        got = response.get("status", {})
        result = {
            "success": True,
            "video_id": video_id,
            "url": f"https://youtube.com/shorts/{video_id}",
            "studio_url": f"https://studio.youtube.com/video/{video_id}/edit",
            "privacy_status": got.get("privacyStatus"),
            "publish_at": got.get("publishAt"),
        }
        # YouTube locks uploads from unaudited API projects to private; say so instead of failing silently.
        if not publish_at and privacy_status == "public" and got.get("privacyStatus") == "private":
            result["warning"] = ("YouTube kept this video private. Your Google Cloud project may need the "
                                 "YouTube API compliance audit before API uploads can be public.")
        print(f"[OK] Uploaded: {result['url']} ({result['privacy_status']}"
              f"{', publishes ' + result['publish_at'] if result['publish_at'] else ''})")
        return result


if __name__ == "__main__":
    YouTubePublisher().authenticate()
    print("YouTube login OK.")
