# The Descent: Remotion template

Renders a vertical 1080×1920 Short of a journey down a depth scale, with a live depth/pressure/temperature HUD, a zone gauge, creatures placed by depth and timed narration captions. Episode 1 is the Mariana Trench (60 s).

Every frame is computed from its frame number and a seed, so the same episode always renders the same video.

## Setup (once)

```powershell
cd remotion
npm install
```

## Preview and edit

```powershell
npm run dev
```

Opens Remotion Studio. You can change the props in the right-hand panel and see the result live.

## Voiceover (Azure AI Speech)

From the project root (`YT Shorts`), once:

```powershell
pip install azure-cognitiveservices-speech requests
```

Then for each episode:

```powershell
python scripts\azure_voice.py remotion\episodes\mariana.json
```

This does four things:

- Speaks every line at a natural pace and retimes the episode so each scene lasts as long as its line plus a short beat. The animation stretches or shrinks to match, so there are no long gaps. Running it again gives the same timing.
- Writes the voice to `remotion\public\audio\mariana.mp3` and the word timings into the episode file, so captions highlight each word as it's spoken.
- Builds an original music and sound-effects bed, `mariana_bed.mp3`, with `scripts\sound_design.py`: an ambient pad and drone that darken with depth, water texture, a sonar ping at each new zone, hull creaks in the deep, a thud on landing and a whoosh into the plates scene. It's all synthesised, so there's nothing to license.
- The template lowers the music under the voice automatically.

Change the voice with `AZURE_VOICE=` and the speaking speed with `AZURE_RATE=` (percent, default 5) in `.env`. To rebuild only the sound bed: `python scripts\sound_design.py remotion\episodes\mariana.json`.

## Render

```powershell
npx remotion render Descent ..\output\drafts\mariana-descent.mp4 --props=episodes\mariana.json
```

To make a new episode, copy `episodes/mariana.json`, change it, and pass the new file with `--props`. The orchestrator can write these JSON files directly.

## Episode fields

| Field | What it does |
| --- | --- |
| `keyframes` | `[seconds, depth]` pairs. The sub eases between them. The video ends at the last keyframe or narration line. |
| `narration` | Caption lines with `from`/`to` seconds. This text is also the voiceover script. |
| `zones` | Named depth bands, shown on the gauge and under the depth readout. |
| `colours`, `temperature` | Water colour and temperature by depth. |
| `creatures` | `{depth, x, kind}`. `x` is 0–1 across the screen. Kinds: fish, turtle, jelly, lantern, squid, whale, angler, gulper, dumbo, cuc, snail, amph, xeno. |
| `comparison` | Optional marker on the gauge, such as Everest's height. |
| `platesAt` | Second when the plate-tectonics cross-section appears. Leave out to skip it. |
| `voiceover` | Optional audio file in `public/`, for example `audio/mariana.mp3`. |
| `music` | Optional music and sound-effects bed in `public/`, lowered automatically under the voice. |
| `seed` | Changes the marine-snow pattern. |

## Files

- `src/descent/draw.ts`: canvas drawing (water, light, particles, seabed, creatures, sub, plates)
- `src/descent/Descent.tsx`: HUD, gauge, captions and audio
- `src/descent/types.ts`: the episode schema
- `src/descent/episodes/mariana.ts`: episode 1 with its fact sources
- `public/fonts/`: Barlow Condensed (SIL Open Font License), bundled so renders work offline
