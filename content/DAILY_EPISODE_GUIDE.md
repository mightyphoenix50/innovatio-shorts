# Daily episode guide

How the daily scheduled task writes one new Innovatio Short. It follows this file every evening, so editing it changes how every future episode is written; the task itself never needs to change.

The project is the private GitHub repo `mightyphoenix50/innovatio-shorts`. Clone it, work in the clone, and push to `main`. Paths below are relative to the repo root.

## What a run does

1. **Pick the topic.** Open `content/topics.json` and take the first entry with `"status": "next"`. Skip it if `remotion/episodes/<slug>.json` or `remotion/episodes/queue/<slug>.json` already exists. If fewer than 3 topics are left, add new ones (see "Finding new topics").
2. **Research.** Look up every number and claim the script will use, on the web, before writing. Open each source page and check it says what the script says. Prefer Wikipedia, NASA, NOAA, USGS, Guinness World Records, university and museum pages, and major science outlets. Don't use content farms, AI-written fact sites or forums.
3. **Write the episode** as JSON, using the matching example file as the pattern (below).
4. **Save it** to `remotion/episodes/queue/<slug>.json` and **check it**: `python3 scripts/validate_episode.py remotion/episodes/queue/<slug>.json` must print ✓. Fix every problem it lists.
   It must include a `skit` (the checker fails new episodes without one).
5. **Update `content/topics.json`**: set the topic's `status` to `"queued"` and add `"queued_on": "<YYYY-MM-DD>"`.
6. **Commit and push** both files to `main` in one commit, `Queue episode: <title>` (pull with rebase first if the push is rejected). The push starts the "Produce episodes" GitHub workflow, which voices, renders and checks the episode and sends it to Telegram for approval.
7. **Report** in one short message: the title, the twist, and the sources.

Change only `remotion/episodes/queue/<slug>.json` and `content/topics.json`. Don't edit code, workflows or settings, don't run `produce.py` or any workflow, don't delete anything, and don't push anything else.

## The four formats

| Format | Use for | Example to copy |
|---|---|---|
| `Descent` (no `template` field) | Sinking through water: the ocean, a lake, a whale's dive. Depth zones, sea creatures, water temperature, pressure. | `remotion/episodes/mariana.json` |
| `Fall` + `"direction": "down"` | Falling or digging through solid layers: a planet, a moon, ice, rock. Ends on a tunnel diagram. | `remotion/episodes/earth-fall.json` |
| `Fall` + `"direction": "up"` | Rising through the sky: altitude, air thinning, things that fly. Ends by zooming out to the planet. | `remotion/episodes/float-up.json` |
| `Orbit` | A tour around a whole world seen from space, in 3D: places on its surface, how big things are, what covers it. Earth uses the real map; other worlds are drawn in their style. | `remotion/episodes/earth-water.json` |

Copy the example's structure field for field, then change the content. Don't invent new fields.

What each format can draw (anything else is rejected by the checker):

- **Descent creatures:** fish, turtle, jelly, lantern, squid, whale, angler, gulper, dumbo, cuc (sea cucumber), snail (snailfish), amph (amphipod), xeno (xenophyophore). `x` is 0–1 across the screen.
- **Fall landmarks:** `mine` (tunnel with miners), `borehole` (drill pipe ending at the depth), `boundary` (dashed line with a label: use for any layer edge or named level), `center` (glowing point), `mountain` (peak reaching that altitude), `plane` (airliner crossing), `balloon` (high-altitude balloon), `station` (space station). Labels ≤ 30 characters, e.g. `"Deepest mine · 4 km"`.
- **Fall textures going down:** soil, strata, granite, mantle (slow swirls), liquid (waves), crystal (facets; also works as ice).
- **Fall textures going up:** cloud, ozone, haze, aurora, stars.
- **Orbit worlds (`body.kind`):** earth (real continents and oceans, with clouds), mars, moon, mercury, venus, gas (a banded giant; set `colours` to three bands light to dark, and `rings: true` for Saturn), ice (cracked ice like Europa), lava (glowing cracks like Io). Optional `moon: true` (a small moon orbiting behind), `glow` (atmosphere colour, `#RRGGBB`; leave out for airless worlds), `tilt` (degrees) and `radiusKm` (the real radius; needed for `ballKm`).
- **Orbit stops:** one place per narration line that needs one, `{line, lat, lon, label, value, caption}`. The globe turns to bring the place to the front while its line plays and drops a pin on it. `label` ≤ 24 characters (next to the pin), `value` ≤ 9 (the big number on the stat card, e.g. `"10.9 km"`), `caption` ≤ 22 (above the number, e.g. `"Deepest point"`). Use real coordinates for Earth places; on other worlds use the feature's real lat/lon even though the surface is stylised. `ballKm` (optional) stands a ball of that diameter on the place, to scale with the world: use it for "if you gathered all of X into one ball" moments. 3+ stops; at most one per line.
- **Sound effects (`sfx`):** dive_splash, sonar_ping, hull_creak, seabed_thud, whoosh, fall_wind, rock_rumble, lava_bubble, plane_flyby, station_beep. `at` is seconds, `"fallAt"`, `"diagramAt"`, `"skit"`, or `"depth:<metres>"` (the moment that depth is reached). Use 3–7 effects; always a `whoosh` at `diagramAt` when there is a diagram. Descent episodes can leave `sfx` out (they get pings, creaks and a landing thud automatically). Orbit episodes must list them in seconds: a `whoosh` (`"align": "peak"`) on big turns or zooms, `station_beep` at the start, `sonar_ping` for anything deep.

If a great topic needs something not on these lists, don't force it: set its status to `"needs_visuals"` with a note saying what it needs, and take the next topic.

## Writing the script

The channel voice follows the reference video the owner liked (Awaken, "Can 2 People Really Restart Humanity?"): second person, escalating, curious, a little playful, always sourced.

- **Hook (line 1, ≤ 3 s):** put the viewer in the scenario. "Someone dug a hole straight through the Earth. And you just tripped into it."
- **8–9 lines, 110–170 words in all.** Each line under 28 words, with one fact per line, and each one more extreme than the last.
- **Headings** are short labels for the caption card: "4 km down", "The mantle", "The twist", ≤ 28 characters.
- **One twist** about two-thirds through: a counter-intuitive fact that reframes the journey (it's 1,000 °C up there but you'd freeze; the whole fall takes only 38 minutes).
- **Close** with a zoom-out or payoff, then a question viewers can answer in the comments. Bit's skit follows it (see "The end skit").
- Numbers as words where they're spoken ("Four kilometres", "minus 56 degrees") so the voice reads them naturally.
- No gore or shock about death: people pass out or need suits; keep it factual and light.
- Every line with a fact gets a short `source` tag, e.g. `"Kola Superdeep Borehole"`, `"NASA Space Place"`. Every fact also appears in `sources` with the exact page URL and the claim it supports.

## The end skit (every episode)

Every Short ends with a tiny comedy beat from **Bit**, the channel's mascot: a small, friendly AI robot that pops in after the last line, says one joke in its own voice and reacts. It's the channel's signature, so every new episode has one.

```json
"skit": {"text": "See? Still more than enough water to keep me cool.", "mood": "wink", "action": "*winks*"}
```

- **`text`**: one line, ≤ 16 words, spoken by Bit. It lands best as a self-aware AI aside on the episode's payoff or closing question: Bit being smug, oblivious, dramatic or a bit too pleased with itself (in the example, a nod to computers needing water for cooling). Examples of the tone: "Relax. I only need a teaspoon of the Sun." / "Thirty-eight minutes? I'd still be buffering." / "Good thing I'm waterproof. I think."
- **`mood`**: Bit's reaction on the last word: `wink`, `smug`, `gasp`, `shrug` or `laugh`.
- **`action`** (optional, ≤ 24 characters): a stage direction shown under the bubble, e.g. `"*winks*"`, `"*nervous beep*"`.
- Keep it kind: the joke is on Bit, never on the viewer or real people. No new facts in the skit (it isn't sourced), and don't contradict the episode.
- The voice step times it after the last line, so leave out `from`, `to` and `words`. A cartoon pop plays as Bit appears; don't add it to `sfx`.

## Timing and visuals

- Start times: `narration` lines run back to back from 0, about 6 s each (line 1 is 3 s). The voice step retimes everything to the real voice, so rough numbers are fine, but lines must touch (each `from` = previous `to`).
- `keyframes` are `[seconds, metres]`. Arrive at each landmark about 2 s into its line, then drift slowly (don't sit perfectly still) until the next line. Hold the final depth to the end.
- `fallAt` (Fall): when you trip in or lift off, about 2.6 s.
- `visualScale` (Fall): `[metres, pixels]` pairs that stretch the interesting parts. Give each landmark roughly 500–900 px of travel from the one before, and extend one step past `maxDepth` so the screen never runs out of world.
- `diagramAt`: the start of the last one or two lines. Tunnel diagrams use `start`, `end`, `timer` and `speed` as the four labels. The atmosphere diagram (`"kind": "atmosphere"`) uses `timer` and `speed` for two headline pills, `start` for the air label and `end` for the orbit label.
- Orbit `keyframes` are `[seconds, zoom]`, zoom 0 (the whole world small in space) to 1 (flown in close). Start at 0, ease to 0.3–0.5 for wide facts and 0.7–0.75 for close-ups, about 2 s into each line, and pull back to 0.1–0.15 for the twist or the close. Orbit has no `maxDepth`, `temperature`, `fallAt` or `diagramAt`.
- Temperature in °C. Pressure in atm (`"pressureUnit": "atm"`) going down, or percent of surface air (`"pressureUnit": "percent"`) going up.
- Colours `#RRGGBB`, from the reference palette: warm sky #E8DAC8 → #E29578 → #5C4D7D; earth browns #8C6A4F / #A7825F; molten #B5532E → #F09A3E; ice blues #CFE8F3 → #7FB8D6; blueprint #0D1B2A.
- `seed` = the slug.

## YouTube fields

- `youtube.titles`: two options under 70 characters. One "What if…" question, one plain statement. No clickbait the video doesn't pay off.
- `youtube.description`: 1–2 sentences on what the viewer will see (sources and credits are added automatically).
- `youtube.tags`: 5–8 lowercase tags, ending with `"science shorts"`.
- `series`: `"What if…"` for Fall episodes, `"Journeys"` for Descent, `"Planet scale"` for Orbit.

## Finding new topics

When fewer than 3 `next` topics remain, add 5 more to `content/topics.json`. Good topics are journeys through real, measurable layers, or tours of a whole world's surface, with a surprising twist, that fit one of the four formats. If the vidIQ connector is available, check `vidiq_outliers` / `vidiq_keyword_research` for "what if" and scale/journey Shorts in science, space and earth science for what's rising. Don't copy other videos' scripts: use them only to see which questions people are curious about.

Each topic entry: `{"slug": "...", "title": "...", "format": "Descent|Fall-down|Fall-up|Orbit", "angle": "the hook and the twist in one sentence", "status": "next"}`.
