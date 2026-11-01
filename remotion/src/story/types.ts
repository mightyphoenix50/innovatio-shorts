import { z } from "zod";
import { beatSchema, hookSchema } from "../shared/Edit";
import { skitSchema } from "../shared/Skit";

/** What Story can draw. Each list is mirrored in scripts/validate_episode.py. */
export const places = ["city", "room", "street", "stadium", "lab", "night", "meadow"] as const;
export const poses = ["idle", "catch", "point", "cheer", "shrug", "think", "run", "slump"] as const;
export const moods = ["neutral", "happy", "smug", "shocked", "determined", "sad"] as const;
export const props = ["ball", "phone", "cup", "clock", "car", "bulb", "trophy", "book", "flower", "bee", "eye", "brain", "rocket", "coin"] as const;
export const motions = ["hold", "fall", "fly", "float"] as const;
export const effects = ["none", "slowmo", "speed", "glow", "uv"] as const;
export const cameras = ["push", "pull", "pan", "still"] as const;

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/**
 * Story: a "what if YOU could…" story in 2D. The channel's hero (a round-headed kid in a hoodie) acts out
 * each narration line in a painted place: one scene per line, with a pose, a mood, a prop, extras in the
 * background, an effect (slow motion, speed lines, a power glow, ultraviolet vision) and the camera's move.
 * Optional devices per scene: a flip scoreboard, a cause → effect chain, and a callout label.
 */
export const sceneSchema = z.object({
  /** Narration line this scene plays under. One scene per line; a line without one keeps the previous scene. */
  line: z.number().int().min(0),
  place: z.enum(places),
  pose: z.enum(poses).default("idle"),
  mood: z.enum(moods).default("neutral"),
  /** Where the hero stands, 0 (left) to 1 (right). */
  x: z.number().min(0).max(1).default(0.5),
  prop: z
    .object({
      kind: z.enum(props),
      /** hold: in the hero's hand. fall: drops from the top toward the hand. fly: crosses the screen. float: hovers by the hero. */
      motion: z.enum(motions).default("hold"),
    })
    .optional(),
  /** Background people, 0–5. They freeze in slow motion and jump in "cheer". */
  others: z.number().int().min(0).max(5).default(0),
  othersPose: z.enum(["idle", "cheer", "point"]).default("idle"),
  effect: z.enum(effects).default("none"),
  camera: z.enum(cameras).default("push"),
  /** A small arrowed label on the hero or the prop, e.g. "EYES". ≤ 14 characters. */
  label: z.object({ text: z.string(), on: z.enum(["head", "hand", "prop"]).default("head") }).optional(),
  /** A flip scoreboard, e.g. ["21", "0"]. Each side ≤ 4 characters. */
  score: z.tuple([z.string(), z.string()]).optional(),
  /** A cause → effect chain that lights up step by step, e.g. ["EYES", "BRAIN", "MUSCLES"]. 2–4 steps, ≤ 10 characters each. */
  chain: z.array(z.string()).min(2).max(4).optional(),
});

export const storySchema = z.object({
  template: z.literal("Story"),
  title: z.string(),
  fps: z.number().default(30),
  /** The hero's hoodie colour (the rest of the character is fixed). */
  hero: z.object({ hoodie: hex.default("#2A9D8F") }).default({ hoodie: "#2A9D8F" }),
  scenes: z.array(sceneSchema).min(1),
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
  seed: z.string().default("story"),
});

export type StoryEpisode = z.infer<typeof storySchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Pose = (typeof poses)[number];
export type Mood = (typeof moods)[number];
export type Place = (typeof places)[number];
export type PropKind = (typeof props)[number];
