import { z } from "zod";

export const creatureKinds = [
  "fish",
  "turtle",
  "jelly",
  "lantern",
  "squid",
  "whale",
  "angler",
  "gulper",
  "dumbo",
  "cuc",
  "snail",
  "amph",
  "xeno",
] as const;

export const episodeSchema = z.object({
  title: z.string(),
  fps: z.number().default(30),
  /** [seconds, depth in metres]. Depth is interpolated between keyframes. */
  keyframes: z.array(z.tuple([z.number(), z.number()])),
  /** Deepest point, used for the seabed and the gauge scale. */
  maxDepth: z.number(),
  /** Background colour by depth: [depth, [r, g, b]]. */
  colours: z.array(z.tuple([z.number(), z.tuple([z.number(), z.number(), z.number()])])),
  zones: z.array(
    z.object({ from: z.number(), to: z.number(), name: z.string(), colour: z.string() }),
  ),
  /** Water temperature by depth in °C: [depth, temp]. */
  temperature: z.array(z.tuple([z.number(), z.number()])),
  creatures: z.array(
    z.object({ depth: z.number(), x: z.number(), kind: z.enum(creatureKinds) }),
  ),
  /** Narration lines. Times in seconds. These are the captions and the voiceover script. */
  narration: z.array(
    z.object({
      from: z.number(),
      to: z.number(),
      heading: z.string(),
      text: z.string(),
      /** Word timings written by scripts/azure_voice.py: seconds, plus the word's position in `text`. */
      words: z
        .array(z.object({ start: z.number(), end: z.number(), char: z.number(), len: z.number() }))
        .optional(),
    }),
  ),
  /** Optional comparison marker on the gauge, measured up from maxDepth. */
  comparison: z.object({ label: z.string(), height: z.number(), showAfter: z.number() }).optional(),
  /** Second at which the plate-tectonics cross-section fades in. Omit to skip it. */
  platesAt: z.number().optional(),
  /** Optional voiceover file in public/, e.g. "audio/mariana.mp3". */
  voiceover: z.string().optional(),
  /** Optional music and sound-effects bed in public/, written by scripts/sound_design.py. */
  music: z.string().optional(),
  /** Series name, shown on the review card. */
  series: z.string().optional(),
  /** YouTube metadata used by scripts/produce.py: two title options, description and tags. */
  youtube: z
    .object({
      titles: z.array(z.string().max(100)).min(1).max(2),
      description: z.string(),
      tags: z.array(z.string()).default([]),
    })
    .optional(),
  /** One source per fact used in the narration; listed in the description. */
  sources: z.array(z.object({ claim: z.string(), url: z.string().url() })).optional(),
  /** Seed for particle positions, so every render is identical. */
  seed: z.string().default("descent"),
});

export type Episode = z.infer<typeof episodeSchema>;
export type CreatureKind = (typeof creatureKinds)[number];
