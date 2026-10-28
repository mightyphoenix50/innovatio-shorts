# YouTube Shorts Automation — Channel & Pipeline Master Handoff

> **Channel Niche:** Science, Space & Technology  
> **Channel Status:** 100% Operational & Verified Live on YouTube  
> **Date:** October 26, 2026  
> **Operating Environment:** Windows (PowerShell), Python 3.12, FFmpeg 9.0.2, Node v24, Local Unreal Engine 5.8  

---

## 1. Credentials

> Secrets live only in `.env` (git-ignored). See `.env.example` for the keys. Never paste values into this file.

### 1.1 Telegram Mobile Approval Desk

| Parameter | Value | Description |
|---|---|---|
| **Bot Name** | `@Innovatioshorts_bot` | Telegram Bot used to review video drafts |
| **Bot Token** | `<in .env: TELEGRAM_BOT_TOKEN>` | Telegram HTTP API authentication token |
| **Chat ID** | `8811031878` | Direct Telegram chat ID for the channel owner |
| **API Endpoint** | `https://api.telegram.org/bot<TOKEN>/` | Base REST endpoint for dispatching & webhook/polling |

#### Telegram Settings JSON (`config/settings.json`):
```json
{
  "telegram": {
    "bot_token": "<in .env: TELEGRAM_BOT_TOKEN>",
    "chat_id": "8811031878"
  }
}
```

---

### 1.2 Google Cloud & YouTube Data API v3

| Parameter | Value |
|---|---|
| **Project ID** | `western-lambda-512811-g1` |
| **App Name** | YT Shorts Automation |
| **Client ID** | `1022009803994-aof9jrs89tj33f7eujvb6vu9t6o5qtu1.apps.googleusercontent.com` |
| **Client Secret** | `<in .env: GOOGLE_CLIENT_SECRET>` |
| **Auth URI** | `https://accounts.google.com/o/oauth2/auth` |
| **Token URI** | `https://oauth2.googleapis.com/token` |
| **Redirect URI** | `http://localhost` |
| **OAuth Token Pickle** | `config/youtube_token.pickle` (Active, Refreshable & Authenticated) |
| **OAuth Scope** | `https://www.googleapis.com/auth/youtube.upload` |
| **Upload Privacy Status** | `"public"` |
| **YouTube Category ID** | `"28"` (Science & Technology) |

#### OAuth Client Secrets File (`config/client_secret.json`):
```json
{
  "installed": {
    "client_id": "1022009803994-aof9jrs89tj33f7eujvb6vu9t6o5qtu1.apps.googleusercontent.com",
    "project_id": "western-lambda-512811-g1",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "<in .env: GOOGLE_CLIENT_SECRET>",
    "redirect_uris": ["http://localhost"]
  }
}
```

---

## 2. Complete Catalog of Live YouTube Shorts

All 7 produced Shorts were reviewed, approved via Telegram inline buttons, and successfully uploaded to your YouTube channel as **Public**:

| # | Topic | Title | Video ID | Live Short URL |
|---|---|---|---|---|
| **0** | **Black Holes (Pilot)** | Two Supermassive Black Holes in a Cosmic Death Spiral! | `T4A4wxtxeJE` | [https://youtube.com/shorts/T4A4wxtxeJE](https://youtube.com/shorts/T4A4wxtxeJE) |
| **1** | **Space 1 (JWST)** | [Space 🔭] James Webb Peeks Into the Dawn of Time! | `EvJtieGN9fQ` | [https://youtube.com/shorts/EvJtieGN9fQ](https://youtube.com/shorts/EvJtieGN9fQ) |
| **2** | **Space 2 (Exoplanet)** | [Space 🪐] The Trillion Dollar Diamond Planet! | `Iq6GT_JyX2w` | [https://youtube.com/shorts/Iq6GT_JyX2w](https://youtube.com/shorts/Iq6GT_JyX2w) |
| **3** | **Science 1 (Quantum)** | [Science ⚛️] Quantum Entanglement: Einstein Was Terrified! | `xHUrFt_SPkw` | [https://youtube.com/shorts/xHUrFt_SPkw](https://youtube.com/shorts/xHUrFt_SPkw) |
| **4** | **Science 2 (Biology)** | [Science 🪼] The Immortal Creature That Cheated Death! | `BWG521JU1lM` | [https://youtube.com/shorts/BWG521JU1lM](https://youtube.com/shorts/BWG521JU1lM) |
| **5** | **Tech 1 (Microchip)** | [Tech 💻] 50 Billion Transistors on a Fingernail! | `Xokx9f-foRo` | [https://youtube.com/shorts/Xokx9f-foRo](https://youtube.com/shorts/Xokx9f-foRo) |
| **6** | **Tech 2 (Quantum AI)** | [Tech 🤖] The Quantum Computer That Will Break the Internet! | `8uYYt3ZbQ_Y` | [https://youtube.com/shorts/8uYYt3ZbQ_Y](https://youtube.com/shorts/8uYYt3ZbQ_Y) |

---

## 3. Implemented Pipeline Architecture

```
                    ┌───────────────────────────────┐
                    │  1. Topic & Script Engine     │
                    │  (Space, Science, Tech Prompts)│
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │  2. High-Energy Voice Engine  │
                    │  (Edge-TTS: GuyNeural +10%)   │
                    │  WordBoundary SRT + Duration  │
                    └───────────────┬───────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           │                                                 │
┌──────────▼──────────────────────┐       ┌──────────────────▼──────────────┐
│  3A. Topic Visual Engine        │       │  3B. Playlist CC B-Roll Engine  │
│  (1-to-1 Relevant 4K/HD Video)  │       │  (Drone waves, cities, earth)   │
│  Assets: assets/stock/*.mp4     │       │  Assets: assets/cc_broll/*.mp4  │
└──────────┬──────────────────────┘       └──────────────────┬──────────────┘
           │                                                 │
           └────────────────────────┬────────────────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │  4. Dual-Stack Split Renderer │
                    │  Top: 1080x960 (Blur-Fill)    │
                    │  (Zero Video Text Cutoff!)    │
                    │  Bottom: 1080x960 (CC Loop)   │
                    │  Center: High-Contrast SRT    │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │  5. Telegram Approval Desk    │
                    │  Sends MP4 + Inline Buttons:  │
                    │  [✅ Approve]   [❌ Reject]   │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │  6. Standing Daemon           │
                    │  (Listens for phone tap)      │
                    │  Tapped Approve ➔ Upload Live │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │  7. YouTube Publisher API     │
                    │  Resumable Upload ➔ Public    │
                    │  Updates Telegram with URL    │
                    └───────────────────────────────┘
```

---

## 4. Key Engineering Solutions & Fixes

1. **Zero Text Cutoff in Split Screen (Blur-Fill Letterbox):**
   - **Problem:** Standard 9:16 cropping on 16:9 widescreen videos chopped off 35% of the sides, cutting diagrams, text, and labels in half.
   - **Solution:** Top-half FFmpeg filter:
     ```ffmpeg
     [0:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,boxblur=25:5[top_bg];
     [0:v]scale=1080:-2[top_fg];
     [top_bg][top_fg]overlay=0:(960-h)/2[top];
     [1:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[bottom];
     [top][bottom]vstack[stacked];
     [stacked]subtitles='_active_subtitles.srt':force_style='FontName=Arial,FontSize=18,Bold=1,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,Outline=3,Shadow=1,Alignment=2,MarginV=120'[v]
     ```
   - **Result:** 100% of the video width (1080px) is preserved. Every label and diagram is crystal-clear and centered. Soft ambient blurred glow fills the top/bottom bars.

2. **Zero Audio/Voice Truncation:**
   - **Problem:** Edge-TTS audio tail truncation when hardcoding video lengths.
   - **Solution:** Exact duration measured via `ffprobe` down to milliseconds, with a mandatory `+0.4s` tail buffer. Video rendering duration is locked to this exact timestamp.

3. **Word-Level Subtitle Synchronization:**
   - **Problem:** Edge-TTS v7.3 defaults to sentence-level subtitles.
   - **Solution:** Initialized with `Communicate(..., boundary="WordBoundary")`, enabling exact word-by-word timestamps in the generated `.srt` files.

4. **FFmpeg Path Space Workaround:**
   - **Problem:** Spaces in Windows OneDrive paths (`Ameens projects/YT Shorts`) broke `libass` subtitle parser.
   - **Solution:** Automatically copies subtitle file to `_active_subtitles.srt` in the project root during render and removes it afterward.

5. **Asynchronous Telegram Mobile Approvals:**
   - **Problem:** Mobile approval buttons spinning indefinitely without background processing.
   - **Solution:** Built `scripts/telegram_daemon.py` which runs continuously as a background service, captures callback queries, executes YouTube OAuth resumable upload, and updates the Telegram message caption with the live YouTube URL.

---

## 5. Directory Structure & Key Files

```
YT Shorts/
├── config/
│   ├── client_secret.json        # Google Cloud OAuth 2.0 Client credentials
│   ├── settings.json             # Master channel configuration (Telegram, voice, video, privacy)
│   └── youtube_token.pickle      # Serialized authenticated user tokens
│
├── assets/
│   ├── audio/                    # Generated Edge-TTS MP3 voiceovers and SRT subtitles
│   ├── cc_broll/                 # Downloaded Creative Commons drone and wave loops
│   │   ├── city_life_drone.mp4
│   │   ├── earth_to_space.mp4
│   │   └── sea_waves_drone.mp4
│   ├── stock/                    # 4K & HD Topic-Specific Video Clips
│   │   ├── space_1_webb.mp4                   # JWST Deep Field Zoom
│   │   ├── space_2_diamond_planet.mp4         # 55 Cancri e Lava/Diamond Simulation
│   │   ├── science_1_quantum_entanglement.mp4 # 3D Entangled Particles
│   │   ├── science_2_jellyfish.mp4            # Turritopsis dohrnii 4K
│   │   ├── tech_1_nanometer_chip.mp4          # Intel Silicon Cleanroom Fab
│   │   └── tech_2_quantum_computer.mp4        # Google Quantum AI Lab Refrigerator
│   ├── Logo/                     # High-res channel emblems and icons
│   └── ue5_vault/                # Unreal Engine 5.8 3D scene files & templates
│
├── scripts/
│   ├── auth_youtube.py           # Single-flow browser OAuth 2.0 authenticator
│   ├── fetch_cc_broll.py         # Downloader for Creative Commons playlist B-roll
│   ├── generate_all_voices.py    # Batch script for generating voiceovers & SRTs
│   ├── orchestrator.py           # Master automated pipeline coordinator
│   ├── render_all_batch.py       # Batch renderer with zero-text-crop split-screen
│   ├── search_relevant_media.py  # Targeted visual search helper
│   ├── telegram_daemon.py        # Background daemon listening for Telegram approvals
│   ├── telegram_desk.py          # Telegram draft dispatcher with inline buttons
│   ├── video_renderer.py         # FFmpeg dual-stack & blur-fill rendering engine
│   ├── voice_engine.py           # Edge-TTS voice engine with WordBoundary
│   └── youtube_publisher.py      # Resumable YouTube Data API v3 publisher
│
├── output/
│   ├── drafts/                   # Rendered 1080x1920 MP4 Shorts
│   └── pending_drafts.json       # Live state registry for Telegram messages & statuses
│
└── HANDOFF.md                    # This document
```

---

## 6. How to Operate & Run the Pipeline

### 6.1 Start the Telegram Approval Daemon
The daemon runs quietly in the background and waits for your taps on Telegram:
```powershell
python scripts/telegram_daemon.py
```
*Note: To run as a background task in Antigravity or PowerShell, leave it running in a separate terminal window.*

### 6.2 Render and Dispatch a Batch of Shorts
To render all 6 topic-specific Shorts and push them to your phone:
```powershell
python scripts/render_all_batch.py
```

### 6.3 Generate New Voiceovers & Captions
To create a new energetic voiceover and synchronized SRT subtitle file:
```powershell
python -c "
from scripts.voice_engine import VoiceEngine
ve = VoiceEngine()
duration, srt_file = ve.generate_voiceover_sync(
    'Did you know that neutron stars spin 700 times per second? If you stepped on one, you would be instantly crushed into subatomic particles!',
    'assets/audio/neutron_star.mp3'
)
print(f'Done! Duration: {duration}s, SRT: {srt_file}')
"
```

### 6.4 Re-authenticate YouTube (If Token Ever Expires)
If your Google token needs renewal in the future:
```powershell
python scripts/auth_youtube.py
```
This automatically launches your browser, completes Google OAuth, and saves the new `config/youtube_token.pickle`.

### 6.5 Add More CC B-Roll from Playlists
To download more satisfying B-roll clips from your YouTube playlist:
```powershell
python scripts/fetch_cc_broll.py
```

---

## 7. Future Expansion Roadmap

1. **Automated Daily Scheduling (Cron / `/schedule`):**
   - Automatically generate, render, and send 2 new Shorts to your Telegram every morning at 08:00 AM.
2. **Dynamic AI Script Generation:**
   - Integrate Google Gemini / DeepSeek API to automatically scrape trending science news (NASA APOD, arXiv, Nature) and draft daily viral hooks.
3. **Unreal Engine 5.8 Procedural Cinematic Vault:**
   - Use the local Unreal Engine 5.8 installation (`assets/ue5_vault/`) with Lumen and Nanite to render proprietary 3D space and nanotechnology animations that no other channel has.
4. **Channel Analytics Feedback Loop:**
   - Pull YouTube Analytics API v3 watch-time and CTR to automatically iterate on voice pitch, hook pace, and B-roll styles.
