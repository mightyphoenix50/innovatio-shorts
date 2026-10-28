# Innovatio Shorts

The automated pipeline behind the Innovatio YouTube channel (science, space, tech): code-animated Shorts, written from sourced research, voiced, scored, rendered, sent to Telegram for approval and scheduled on YouTube. Nothing runs on a personal computer.

## How a day works

1. **19:36 SAST, Claude scheduled task "Innovatio daily episode":** picks the next topic from `content/topics.json`, researches it, writes `remotion/episodes/queue/<slug>.json` following `content/DAILY_EPISODE_GUIDE.md`, checks it with `scripts/validate_episode.py`, and pushes it here.
2. **GitHub workflow "Produce episodes"** (starts on that push): Azure voice and word timings → sound effects (Freesound, picked by earshot) → lobby music bed → Remotion render → quality checks → the draft is sent to Telegram. The video is kept on the `drafts` release; state and timings are committed back.
3. **You tap a button in Telegram:** Schedule (title A or B), Publish now, or Reject.
4. **GitHub workflow "Telegram approvals"** (every 30 min, 06:00–23:30 SAST): acts on the taps. Scheduled uploads go up private and YouTube publishes them at the next free 18:00 slot.

Send `/status` to the bot to see what's waiting and what's scheduled (answered at the next check).

## Doing things by hand

- **Produce one episode now:** Actions → Produce episodes → Run workflow, episode `remotion/episodes/<slug>.json` (flags e.g. `--revoice`, `--resource`, `--no-send`).
- **Act on a tap straight away:** Actions → Telegram approvals → Run workflow.
- **Add or reorder topics:** edit `content/topics.json`.
- **Change how episodes are written:** edit `content/DAILY_EPISODE_GUIDE.md`.

## Layout

| Path | What |
|---|---|
| `remotion/` | The animation templates: `Descent` (ocean dive) and `Fall` (down through layers, or up through the sky) |
| `remotion/episodes/` | One JSON file per episode; `queue/` holds new ones waiting to be produced |
| `scripts/` | Pipeline steps: `produce.py` runs them all; `produce_queue.py` runs it for each queued episode |
| `audio/` | Sound effects picked for each episode (CC0 / CC BY, credited in descriptions) |
| `state/` | Draft registry and Telegram position, committed by the workflows |
| `content/` | Topic backlog and the episode-writing guide |
| `config/settings.json` | Publish slots, time zone, YouTube category |

## Secrets

Kept in Settings → Secrets and variables → Actions, never in files: `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `FREESOUND_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`. For local runs the same names go in `.env` (see `.env.example`).
