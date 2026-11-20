# Innovatio Shorts: handoff for a new coding agent

Everything an agent (e.g. Google Antigravity) needs to work on this project safely. Written 2026-11-20.

> **This repo is public.** Never put a key, token, password, chat ID or `.env` content in any file, commit,
> issue or log. Secrets live only in GitHub Actions secrets (and, for local runs, a git-ignored `.env`).

## 1. What it is

The fully automated pipeline behind the **Innovatio** YouTube channel (science / space / tech Shorts, "what if
you…" journey style). Each day: research → episode JSON → voice → sound → Remotion render → QC → Telegram
approval → YouTube upload. Nothing runs on a personal computer; it all runs on GitHub Actions plus one
Claude scheduled task.

- **Repo:** `https://github.com/mightyphoenix50/innovatio-shorts` (public, default branch `main`)
- **Owner GitHub account:** `mightyphoenix50`
- **Stack:** Python 3.11 (pipeline), Node 22 + Remotion 4.0.539 + React 19 + three.js (rendering), ffmpeg.

## 2. The daily flow

| # | When / trigger | What runs | Output |
|---|---|---|---|
| 1 | **19:36 SAST daily** (Claude scheduled task "Innovatio daily episode", cron `CRON_TZ=Africa/Johannesburg 36 19 * * *`) | A Claude session follows `content/DAILY_EPISODE_GUIDE.md`: takes the first `"status": "next"` topic in `content/topics.json`, researches it, writes `remotion/episodes/queue/<slug>.json`, validates with `scripts/validate_episode.py`, marks topic `queued` | One commit `Queue episode: <title>` pushed straight to `main` |
| 2 | Push touching `remotion/episodes/queue/*.json` | Workflow **Produce episodes** (`.github/workflows/produce.yml`) → `scripts/produce_queue.py` → `scripts/produce.py` per episode | MP4 on the GitHub release `drafts`; voice/timings/state committed back as `Produce: update drafts and episode files [skip ci]`; draft sent to Telegram |
| 3 | Owner taps a button in Telegram | — | Schedule (title A or B) / Publish now / Reject |
| 4 | Always on | Workflow **Telegram approvals** (`.github/workflows/approvals.yml`) runs `scripts/telegram_daemon.py --listen 330` (~5½ h), then re-dispatches itself; hourly cron at :17 is a fallback | Uploads to YouTube (scheduled ones go up private and publish at the next free slot); state committed as `Approvals: update drafts [skip ci]` |

Bot command: `/status` shows drafts waiting and scheduled.

### produce.py steps (`python scripts/produce.py remotion/episodes/<slug>.json [flags]`)
1. **Voice:** `scripts/azure_voice.py`. Azure Speech, voice `en-US-AndrewNeural` (+5% rate), skit voice `en-US-AnaNeural`. Writes `remotion/public/audio/<slug>.mp3` (−14 LUFS), writes per-word timings `{start,end,char,len}` into the episode JSON (captions depend on them), and refits the timeline to the voice (`scripts/episode_timing.py`). Re-run with `--revoice`.
2. **SFX:** real recordings from Freesound (`scripts/freesound_sfx.py`, `source_sfx.py`, Openverse fallback), best take picked by **earshot** (optional; falls back to code-made effects). Re-pick with `--resource`. Picks are saved in `audio/`.
3. **Bed:** lobby music + effects (`scripts/sound_design.py`; `SOUND_STYLE=lobby|ambient`).
4. **Render:** Remotion → `output/drafts/<slug>.mp4` (1080×1920, 30 fps).
5. **QC:** size, length, loudness, true peak, frozen frames, sources present. `--send-anyway` overrides.
6. **Send** to Telegram (skip with `--no-send`).

### Templates (Remotion compositions in `remotion/src/`)
`Descent` (ocean dive), `Fall` (down through layers / up through sky), `Scale` (3D size ladder), `Orbit`
(3D world tour), `Story` (2D "what if you…" hero), shared captions/edit in `remotion/src/shared/`.
The owner prefers the 3D look (Scale, Orbit). Allowed fields per template are listed in the episode guide and
enforced by `scripts/validate_episode.py` (which mirrors `remotion/src/*/types.ts`, so keep them in sync).

## 3. Repo layout

| Path | What |
|---|---|
| `scripts/` | Pipeline steps (see above), plus `youtube_publisher.py`, `telegram_desk.py`, `telegram_daemon.py`, `pipeline_state.py`, `merge_state.py`, `auth_youtube.py`, `env_config.py`, `voice_ab.py` |
| `remotion/` | Templates (`src/`), episodes (`episodes/*.json`, `episodes/queue/`, `queue/failed/`), generated audio in `public/audio/` |
| `content/` | `topics.json` (backlog) and `DAILY_EPISODE_GUIDE.md` (how episodes are written) |
| `state/` | `pending_drafts.json`, `telegram_offset.json`. Written by both workflows, merged by `scripts/merge_state.py` (custom git merge driver) |
| `audio/` | Chosen SFX per episode + manifests (CC0 / CC BY, credited in descriptions) |
| `config/settings.json` | Non-secret settings: publish slots (`16:00` UTC), display offset +2, YouTube category 28, privacy |
| `tools/` | `github_secrets.py` (copies `.env` → GitHub secrets), old Windows PC scripts (`install_daemon.ps1` etc., no longer used) |
| `.claude/skills/` | `earshot`, `real-sound` skills used by Claude sessions |

## 4. Credentials (names and where they live; no values here)

All production secrets are **GitHub → Settings → Secrets and variables → Actions** on the repo.
For local runs, copy `.env.example` to `.env` (git-ignored) with the same names.

| Name | Used by | What / how to get or rotate |
|---|---|---|
| `AZURE_SPEECH_KEY` | produce, voice-ab | Azure AI Speech resource key (Azure portal → Speech resource → Keys and Endpoint) |
| `AZURE_SPEECH_REGION` | produce, voice-ab | That resource's region. If blank, `azure_voice.py` probes regions |
| `AZURE_HD_SPEECH_KEY` / `AZURE_HD_SPEECH_REGION` | voice-ab only (optional) | Speech resource in a region offering Dragon HD voices |
| `GEMINI_API_KEY` | voice-ab only | Google AI Studio API key (aistudio.google.com → API keys). Billing must be linked for paid-tier use; owner has Google AI Pro (monthly Cloud credits via Google Developer Program) |
| `TELEGRAM_BOT_TOKEN` | produce, approvals, voice-ab | From @BotFather |
| `TELEGRAM_CHAT_ID` | produce, approvals, voice-ab | Owner's chat; the bot only accepts taps from this chat |
| `FREESOUND_API_KEY` | produce | freesound.org/apiv2/apply |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | approvals | OAuth client (Desktop app) in the Google Cloud project with YouTube Data API v3 enabled |
| `YOUTUBE_REFRESH_TOKEN` | approvals | Channel login, scope `youtube.upload`. Regenerate: run `python scripts/auth_youtube.py` locally (writes `config/youtube_token.pickle`), then `python tools/github_secrets.py` extracts the refresh token and sets the secret via `gh` |
| `GH_TOKEN` | both workflows | Automatic `github.token`, not a stored secret |
| Local-only optional | — | `GOOGLE_PROJECT_ID`, `OPENVERSE_TOKEN`, `SOUND_STYLE`, `AZURE_VOICE`, `AZURE_RATE`, `AZURE_SKIT_VOICE`, `EARSHOT_PYTHON` |

Notes:
- `tools/github_secrets.py` currently syncs only: Azure key/region, Telegram token/chat ID, Freesound, Google client ID/secret, YouTube refresh token. `GEMINI_API_KEY` and the `AZURE_HD_*` keys must be added by hand.
- Never print secrets in workflow logs; `voice_ab.py` sends keys in headers only, so keep that pattern.
- Git-ignored secret files: `.env`, `*.pickle`, `config/client_secret.json`, `config/auth_url.txt`.

## 5. Running things

- **Produce one episode:** Actions → *Produce episodes* → Run workflow, `episode` = `remotion/episodes/<slug>.json`, `flags` e.g. `--revoice --resource --no-send`.
- **Restart the Telegram listener:** Actions → *Telegram approvals* → Run workflow.
- **Voice comparison:** Actions → *Voice A/B test* (sends blind samples to Telegram; changes nothing).
- **Local setup:**
  ```bash
  pip install -r requirements.txt
  ```
  ```bash
  cd remotion && npm ci && npx remotion browser ensure
  ```
  Needs ffmpeg (and `libasound2` for the Azure SDK on Linux). Preview templates with `npm run dev` in `remotion/`. Lint with `npm run lint`.
- **Validate an episode:** `python3 scripts/validate_episode.py remotion/episodes/queue/<slug>.json`.

## 6. Rules to keep the pipeline working

1. **Only one Telegram listener may run.** Do not run `scripts/telegram_daemon.py` locally while the GitHub listener is up, or it steals taps. The old PC listener must stay removed.
2. **`main` moves all day** (daily task + bot commits). Always `git pull --rebase` before pushing; never force-push `main`.
3. Don't hand-edit `state/*.json`; the workflows own them (merged by `scripts/merge_state.py`).
4. The daily task only touches `remotion/episodes/queue/<slug>.json` and `content/topics.json`. To change how episodes are written, edit `content/DAILY_EPISODE_GUIDE.md`, not the task.
5. If you add a template field, update `remotion/src/<template>/types.ts`, `scripts/validate_episode.py` and the guide together.
6. Captions need word timings in the episode JSON. Any voice provider swap must still produce `narration[].words` and `skit.words` as `{start, end, char, len}` (seconds; `char`/`len` index into the line text).
7. Pushes with `[skip ci]` don't trigger workflows; pushes to `remotion/episodes/queue/*.json` on `main` do.

## 7. Open work / known issues

- **Gemini TTS evaluation (in progress).** Candidate: `gemini-3.8-flash-tts` (or `gemini-3.8-flash-lite-tts`). `scripts/voice_ab.py` still tries `gemini-2.5-flash-preview-tts`, `gemini-2.5-flash-tts` (doesn't exist) and `gemini-3.1-flash-tts-preview`, which **shut down on 2026-12-18**, via `generateContent`. Google now documents the 3.8 models on `POST https://generativelanguage.googleapis.com/v1beta/interactions` (header `x-goog-api-key`, `response_format: {"type":"audio"}`, `generation_config.speech_config: [{"voice":"Charon"}]`, style via `speech_metadata.style`). Output is 24 kHz mono 16-bit PCM (WAV). **No word timestamps**, so a `gemini_voice.py` would need forced alignment (e.g. faster-whisper `word_timestamps=True` matched to the known script) to fill `words`. Plan: (1) update `voice_ab.py` to 3.8 and run the A/B; (2) if Gemini wins, add `scripts/gemini_voice.py` with the same outputs as `azure_voice.py` and a `VOICE_PROVIDER` switch in `produce.py` (keep Azure as fallback); (3) add `GEMINI_API_KEY` to `produce.yml` env and `tools/github_secrets.py`.
- `content/DAILY_EPISODE_GUIDE.md` calls the repo "private"; it is public.
- `produce.py` / `produce_queue.py` docstrings still mention the old PC daemon / `install_producer.ps1`; GitHub Actions now does this.
