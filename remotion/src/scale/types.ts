import { z } from "zod";
import { bodyKinds } from "../orbit/types";
import { beatSchema, hookSchema } from "../shared/Edit";
import { skitSchema } from "../shared/Skit";

/** What Scale can draw: Orbit's worlds plus glowing stars. */
export const scaleKinds = [...bodyKinds, "star"] as const;

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/**
 * Scale: a Powers-of-Ten style size ladder in Orbit's 3D toon look. Real objects stand side by side at true
 * relative size, and the camera pulls back from each one to the next, bigger one as its narration line starts.
 */
export const scaleSchema = z.object({
  template: z.literal("Scale"),
  title: z.string(),
  fps: z.number().default(30),
  objects: z
    .array(
      z.object({
        /** Narration line that brings this object in (each object on its own line, in order). */
        line: z.number().int().min(0),
        /** Shown on the label and the stat card, ≤ 22 characters. */
        name: z.string(),
        /** The big readout, e.g. "12,742 km" or "1,400× the Sun". ≤ 14 characters. */
        value: z.string(),
        /** Small caption over the readout, e.g. "WIDE". ≤ 20 characters. */
        caption: z.string().default("WIDE"),
        kind: z.enum(scaleKinds),
        /** Real radius in km: sets the true relative size. */
        radiusKm: z.number().positive(),
        /** Gas giants and stars: three colours, light to dark. */
        colours: z.array(hex).length(3).optional(),
        /** Atmosphere or corona glow colour. Stars always glow (their middle colour if left out). */
        glow: hex.optional(),
        rings: z.boolean().default(false),
      }),
    )
    .min(2),
  narration: z.array(
    z.object({
      from: z.number(),
      to: z.number(),
      heading: z.string(),
      text: z.string(),
      source: z.string().optional(),
      words: z.array(z.object({ start: z.number(), end: z.number(), char: z.number(), len: z.number() })).optional(),
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
  skit: skitSchema,
  hook: hookSchema,
  seed: z.string().default("scale"),
});

export type ScaleEpisode = z.infer<typeof scaleSchema>;
export type ScaleObject = ScaleEpisode["objects"][number];
