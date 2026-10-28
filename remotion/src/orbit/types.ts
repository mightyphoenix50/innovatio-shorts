import { z } from "zod";
import { beatSchema, hookSchema } from "../shared/Edit";
import { skitSchema } from "../shared/Skit";

/** Worlds the Orbit template can draw. earth uses a real map (Natural Earth); the rest are drawn from the seed. */
export const bodyKinds = ["earth", "mars", "moon", "venus", "mercury", "gas", "ice", "lava"] as const;

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const orbitSchema = z.object({
  template: z.literal("Orbit"),
  title: z.string(),
  fps: z.number().default(30),
  /** [seconds, zoom]. Zoom 0 shows the whole world small in space, 1 flies in close to the surface. Eased between keyframes. */
  keyframes: z.array(z.tuple([z.number(), z.number().min(0).max(1)])),
  body: z.object({
    kind: z.enum(bodyKinds),
    /** Name on the opening card, e.g. "Earth" or "Europa". */
    name: z.string(),
    /** Axial tilt shown on screen, in degrees. */
    tilt: z.number().default(23.4),
    /** For gas giants: three band colours, light to dark. Ignored by the other kinds. */
    colours: z.array(hex).length(3).optional(),
    rings: z.boolean().default(false),
    /** A small moon orbiting in the background. */
    moon: z.boolean().default(false),
    /** Atmosphere glow colour; leave out for airless worlds. */
    glow: hex.optional(),
    /** Real radius, used to draw ballKm to scale. Earth 6371. */
    radiusKm: z.number().positive().default(6371),
  }),
  /**
   * Places on the world, one per narration line that needs one (by line index).
   * The globe turns to bring each into view while its line plays. lat/lon in degrees.
   */
  stops: z.array(
    z.object({
      line: z.number().int().min(0),
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      /** Pin label next to the place, ≤ 24 characters. */
      label: z.string(),
      /** Big readout on the stat card, e.g. "71%" or "11 km". */
      value: z.string().optional(),
      /** Small label under the readout, e.g. "OF THE SURFACE". */
      caption: z.string().optional(),
      /** Shows a ball of this diameter in km standing on the place, to scale with the world (e.g. all Earth's water). */
      ballKm: z.number().positive().optional(),
    }),
  ),
  narration: z.array(
    z.object({
      from: z.number(),
      to: z.number(),
      heading: z.string(),
      text: z.string(),
      source: z.string().optional(),
      words: z.array(z.object({ start: z.number(), end: z.number(), char: z.number(), len: z.number() })).optional(),
      /** Micro-beats that land on spoken words (see shared/Edit.tsx). */
      beats: z.array(beatSchema).optional(),
    }),
  ),
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
  sfx: z
    .array(z.object({ need: z.string(), at: z.union([z.number(), z.string()]), align: z.enum(["attack", "peak"]).default("attack") }))
    .optional(),
  /** The end skit: Bit's one-line joke after the last narration line. */
  skit: skitSchema,
  /** The hook: cold open, question banner (see shared/Edit.tsx). */
  hook: hookSchema,
  seed: z.string().default("orbit"),
});

export type OrbitEpisode = z.infer<typeof orbitSchema>;
export type Stop = OrbitEpisode["stops"][number];
