import { z } from "zod";
import { skitSchema } from "../shared/Skit";

export const landmarkKinds = ["mine", "borehole", "boundary", "center", "mountain", "plane", "balloon", "station"] as const;
export const textures = ["soil", "strata", "granite", "mantle", "liquid", "crystal", "cloud", "ozone", "haze", "aurora", "stars"] as const;

export const fallSchema = z.object({
  template: z.literal("Fall").default("Fall"),
  /** "down" falls through the ground (depths in m below the surface); "up" rises through the sky (altitudes in m). */
  direction: z.enum(["down", "up"]).default("down"),
  /** How the pressure table reads: atmospheres, or percent of the air at the surface. */
  pressureUnit: z.enum(["atm", "percent"]).default("atm"),
  title: z.string(),
  fps: z.number().default(30),
  /** [seconds, depth in metres]. The character's depth over time, eased between keyframes. */
  keyframes: z.array(z.tuple([z.number(), z.number()])),
  maxDepth: z.number(),
  /** Second at which the character trips into the hole (down) or lifts off the ground (up). */
  fallAt: z.number(),
  /** Visual scale: [depth in metres, screen distance in px]. Lets a 4 km mine and a 6,371 km core both get screen time. */
  visualScale: z.array(z.tuple([z.number(), z.number()])),
  layers: z.array(
    z.object({
      from: z.number(),
      to: z.number(),
      name: z.string(),
      colourTop: z.string(),
      colourBottom: z.string(),
      texture: z.enum(textures),
    }),
  ),
  landmarks: z.array(
    z.object({ depth: z.number(), kind: z.enum(landmarkKinds), label: z.string(), side: z.enum(["left", "right"]).default("left") }),
  ),
  /** Readouts by depth: [depth, value]. */
  temperature: z.array(z.tuple([z.number(), z.number()])),
  pressure: z.array(z.tuple([z.number(), z.number()])),
  narration: z.array(
    z.object({
      from: z.number(),
      to: z.number(),
      heading: z.string(),
      text: z.string(),
      /** Short source line shown on screen while this line plays. */
      source: z.string().optional(),
      words: z
        .array(z.object({ start: z.number(), end: z.number(), char: z.number(), len: z.number() }))
        .optional(),
    }),
  ),
  /** The closing diagram: Earth cross-section with the fall back and forth. */
  diagramAt: z.number().optional(),
  diagram: z
    .object({
      /** tunnel: Earth cross-section with you swinging through it. atmosphere: zoom out to the thin shell of air. */
      kind: z.enum(["tunnel", "atmosphere"]).default("tunnel"),
      start: z.string(),
      end: z.string(),
      timer: z.string(),
      speed: z.string(),
    })
    .optional(),
  voiceover: z.string().optional(),
  music: z.string().optional(),
  series: z.string().optional(),
  youtube: z
    .object({
      titles: z.array(z.string().max(100)).min(1).max(2),
      description: z.string(),
      tags: z.array(z.string()).default([]),
    })
    .optional(),
  sources: z.array(z.object({ claim: z.string(), url: z.string().url() })).optional(),
  /** Sound effects: which effect plays at which moment. Read by scripts/sound_design.py. */
  sfx: z
    .array(z.object({ need: z.string(), at: z.union([z.number(), z.string()]), align: z.enum(["attack", "peak"]).default("attack") }))
    .optional(),
  /** The end skit: Bit's one-line joke after the last narration line. */
  skit: skitSchema,
  seed: z.string().default("fall"),
});

export type FallEpisode = z.infer<typeof fallSchema>;
