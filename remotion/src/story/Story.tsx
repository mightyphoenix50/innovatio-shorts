import { loadFont } from "@remotion/fonts";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Easing, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { PAL, UI_FONT } from "../fall/drawFall";
import { Beats, HookLayer, PopCaptions, bannerIn, cameraStyle, visualTime } from "../shared/Edit";
import { Skit, skitDuck, skitIn } from "../shared/Skit";
import { Figure, blendPose, handAt, type PoseShape } from "./Hero";
import { GROUND, PlaceArt } from "./Places";
import { PropArt } from "./Props";
import { useMemo } from "react";
import { storySchema, type Pose, type Scene, type StoryEpisode } from "./types";

for (const weight of ["500", "700"]) {
  loadFont({ family: UI_FONT, url: staticFile(`fonts/outfit-latin-${weight}-normal.woff2`), weight });
}

const W = 1080;
const H = 1920;
const HS = 1.05; // hero scale: about 590 px tall, feet above the captions, head top near y 520
const XS = 0.68; // extras' scale
const FADE = 0.28; // crossfade into a new scene
const VOICE_VOLUME = 0.88;
const MUSIC_FULL = 0.75;
const MUSIC_DUCKED = 0.35;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const EXTRA_HOODIES = ["#55607A", "#7A5C6E", "#5E7A6B", "#7A6E55", "#5C5C8A"];

const musicVolume = (ep: StoryEpisode, t: number) => {
  let duck = 0;
  for (const n of ep.narration) {
    const start = n.words?.length ? n.words[0].start : n.from + 0.15;
    const end = n.words?.length ? n.words[n.words.length - 1].end : n.to - 0.45;
    duck = Math.max(duck, interpolate(t, [start - 0.15, start, end, end + 0.5], [0, 1, 1, 0], clamp));
  }
  duck = Math.max(duck, skitDuck(ep, t));
  return MUSIC_FULL + (MUSIC_DUCKED - MUSIC_FULL) * duck;
};

/** The scene for each narration line: its own, or the last one before it. */
const sceneForLine = (ep: StoryEpisode, li: number): { scene: Scene; idx: number } => {
  let idx = 0;
  ep.scenes.forEach((s, i) => {
    if (s.line <= li && s.line >= ep.scenes[idx].line) idx = i;
  });
  return { scene: ep.scenes[idx], idx };
};

const lineAt = (ep: StoryEpisode, t: number) => {
  let li = 0;
  ep.narration.forEach((n, i) => {
    if (t >= n.from) li = i;
  });
  return li;
};

type Placed = { scene: Scene; from: number; to: number; prev: Scene | null };

/** The scene showing at time t, when it started and ended, and the one before it (for pose blending). */
const placedAt = (ep: StoryEpisode, t: number): Placed => {
  const li = lineAt(ep, t);
  const { scene, idx } = sceneForLine(ep, li);
  const from = ep.narration[Math.min(scene.line, ep.narration.length - 1)].from;
  const next = ep.scenes.filter((s) => s.line > scene.line).sort((a, b) => a.line - b.line)[0];
  const to = next ? ep.narration[next.line].from : ep.narration[ep.narration.length - 1].to;
  const prev = idx > 0 ? [...ep.scenes].filter((s) => s.line < scene.line).sort((a, b) => b.line - a.line)[0] ?? null : null;
  return { scene, from, to, prev };
};

const heroState = (p: Placed, t: number) => {
  const k = interpolate(t, [p.from, p.from + 0.4], [0, 1], { ...clamp, easing: ease });
  const prevPose: Pose = p.prev && p.prev.place === p.scene.place ? p.prev.pose : p.scene.pose;
  const pose = blendPose(prevPose, p.scene.pose, k);
  const kx = interpolate(t, [p.from, p.from + 0.6], [0, 1], { ...clamp, easing: ease });
  const x0 = p.prev && p.prev.place === p.scene.place ? p.prev.x : p.scene.x;
  const hx = (x0 + (p.scene.x - x0) * kx) * W;
  return { pose, hx };
};

const toScreen = (hx: number, x: number, y: number) => ({ x: hx + x * HS, y: GROUND + y * HS });

/** Where the prop is drawn on screen. */
const propAt = (p: Placed, pose: PoseShape, hx: number, t: number) => {
  const prop = p.scene.prop;
  if (!prop) return null;
  const slow = p.scene.effect === "slowmo";
  const hand = handAt(pose, t);
  const h = toScreen(hx, hand.hx, hand.hy);
  const len = p.to - p.from;
  const u = (t - p.from) / len;
  switch (prop.motion) {
    case "fall": {
      const arrive = slow ? 0.85 : 0.6;
      const k = interpolate(u, [0.05, arrive], [0, 1], { ...clamp, easing: slow ? (x) => x : Easing.in(Easing.quad) });
      return { x: h.x + 30 * (1 - k), y: interpolate(k, [0, 1], [-160, h.y - 30]), spin: (1 - k) * 220 };
    }
    case "fly": {
      const [a, b] = slow ? [180, 760] : [-180, W + 180];
      return { x: interpolate(u, [0, 1], [a, b], clamp), y: GROUND - 560 * HS + 30 * Math.sin(t * 3), spin: 0 };
    }
    case "float":
      return { x: hx - 240, y: GROUND - 600 * HS + 22 * Math.sin(t * 2.2), spin: 8 * Math.sin(t * 1.7) };
    case "hold":
    default:
      return { x: h.x + 8, y: h.y - 34, spin: 0 };
  }
};

const Extras: React.FC<{ scene: Scene; hx: number; seed: string; t: number }> = ({ scene, hx, seed, t }) => {
  if (!scene.others) return null;
  const slots = [0.1, 0.3, 0.72, 0.9, 0.5, 0.2].filter((x) => Math.abs(x * W - hx) > 300).slice(0, scene.others);
  const pose = blendPose(scene.othersPose as Pose, scene.othersPose as Pose, 1);
  return (
    <g>
      {slots.map((x, i) => (
        <g key={i} transform={`translate(${x * W} ${GROUND - 70}) scale(${XS * (0.92 + 0.12 * random(`${seed}-xs${i}`))})`} opacity={0.88}>
          <Figure pose={pose} mood="neutral" hoodie={EXTRA_HOODIES[i % EXTRA_HOODIES.length]} t={t + i * 0.7} extra frozen={scene.effect === "slowmo"} />
        </g>
      ))}
    </g>
  );
};

const Effect: React.FC<{ p: Placed; t: number; seed: string; target: { x: number; y: number } }> = ({ p, t, seed, target }) => {
  const e = p.scene.effect;
  const on = interpolate(t, [p.from, p.from + 0.5], [0, 1], clamp);
  if (e === "slowmo") {
    return (
      <g opacity={on}>
        <rect x={0} y={0} width={W} height={H} fill="#1D4E89" opacity={0.24} style={{ mixBlendMode: "multiply" }} />
        {[0, 1, 2].map((k) => {
          const ph = ((t - p.from) / 2.4 + k / 3) % 1;
          return <circle key={k} cx={target.x} cy={target.y} r={60 + 380 * ph} fill="none" stroke="#CFE8F3" strokeWidth={5} opacity={0.5 * (1 - ph)} />;
        })}
        {Array.from({ length: 40 }, (_, i) => (
          <circle
            key={i}
            cx={(random(`${seed}-dx${i}`) * W + (t - p.from) * 6) % W}
            cy={random(`${seed}-dy${i}`) * GROUND}
            r={2 + 3 * random(`${seed}-dr${i}`)}
            fill="#E8F4FF"
            opacity={0.55}
          />
        ))}
      </g>
    );
  }
  if (e === "speed") {
    return (
      <g opacity={on}>
        {Array.from({ length: 22 }, (_, i) => {
          const y = 200 + random(`${seed}-ly${i}`) * (GROUND - 160);
          const len = 160 + 260 * random(`${seed}-ll${i}`);
          const x = W + 300 - (((t - p.from) * (1800 + 900 * random(`${seed}-lv${i}`)) + random(`${seed}-lx${i}`) * 2000) % (W + 700));
          return <rect key={i} x={x} y={y} width={len} height={5} rx={3} fill="#F4F4F6" opacity={0.55} />;
        })}
      </g>
    );
  }
  if (e === "glow") {
    return (
      <g opacity={on}>
        <defs>
          <radialGradient id={`${seed}-aura`}>
            <stop offset="0" stopColor="#E9C46A" stopOpacity={0.55} />
            <stop offset="1" stopColor="#E9C46A" stopOpacity={0} />
          </radialGradient>
        </defs>
        <circle cx={target.x} cy={GROUND - 330 * HS} r={420 + 30 * Math.sin(t * 5)} fill={`url(#${seed}-aura)`} />
        {Array.from({ length: 10 }, (_, i) => {
          const a = t * 0.8 + (i / 10) * Math.PI * 2;
          const r = 300 + 40 * Math.sin(t * 3 + i);
          return (
            <path
              key={i}
              d="M 0 -14 L 4 -4 L 14 0 L 4 4 L 0 14 L -4 4 L -14 0 L -4 -4 Z"
              fill="#FFE6B8"
              transform={`translate(${target.x + Math.cos(a) * r} ${GROUND - 330 * HS + Math.sin(a) * r * 1.2}) scale(${1 + 0.5 * Math.sin(t * 6 + i)})`}
            />
          );
        })}
      </g>
    );
  }
  if (e === "uv") {
    return (
      <g opacity={on}>
        <defs>
          <radialGradient id={`${seed}-uvglow`}>
            <stop offset="0" stopColor="#C77DFF" stopOpacity={0.5} />
            <stop offset="1" stopColor="#7B2FF7" stopOpacity={0} />
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill="#7B2FF7" opacity={0.36} style={{ mixBlendMode: "color" }} />
        <circle cx={target.x} cy={target.y} r={520} fill={`url(#${seed}-uvglow)`} style={{ mixBlendMode: "screen" }} />
      </g>
    );
  }
  return null;
};

const SceneView: React.FC<{ ep: StoryEpisode; p: Placed; t: number }> = ({ ep, p, t }) => {
  const { pose, hx } = heroState(p, t);
  const s = p.scene;
  const u = Math.min(1, Math.max(0, (t - p.from) / Math.max(0.5, p.to - p.from)));
  const zoom = s.camera === "push" ? 1 + 0.07 * u : s.camera === "pull" ? 1.09 - 0.07 * u : 1.03;
  const pan = s.camera === "pan" ? 50 - 100 * u : 0;
  const drift = s.camera === "still" ? 0 : s.camera === "pan" ? 80 - 160 * u : 20 - 40 * u;
  const uv = s.effect === "uv" ? interpolate(t, [p.from + 0.2, p.from + 0.8], [0, 1], clamp) : 0;
  const glow = s.effect === "glow" ? 1 : 0;
  const blink = (t % 3.1) > 2.96 && s.mood !== "happy";
  const prop = propAt(p, pose, hx, t);
  const head = toScreen(hx, 0, -470);
  const target = prop ?? head;
  const fadeIn = interpolate(t, [p.from, p.from + FADE], [0, 1], clamp);
  const label = s.label;
  const labelAt = !label ? null : label.on === "prop" && prop ? prop : label.on === "hand" ? toScreen(hx, handAt(pose, t).hx, handAt(pose, t).hy) : toScreen(hx, 70, -560);
  const labelIn = spring({ frame: Math.round((t - p.from - 0.5) * 30), fps: 30, config: { damping: 13 } });
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{
        position: "absolute",
        inset: 0,
        opacity: fadeIn,
        transform: `translateX(${pan}px) scale(${zoom * (1 + 0.04 * (1 - fadeIn))})`,
        transformOrigin: `${(hx / W) * 100}% ${((GROUND - 420) / H) * 100}%`,
      }}
    >
      <PlaceArt place={s.place} seed={ep.seed} t={t} drift={drift} uv={uv} />
      <Extras scene={s} hx={hx} seed={ep.seed} t={t} />
      <ellipse cx={hx} cy={GROUND + 6} rx={130} ry={22} fill="rgba(0,0,0,0.28)" />
      <g transform={`translate(${hx} ${GROUND}) scale(${HS})`}>
        <Figure pose={pose} mood={s.mood} hoodie={ep.hero.hoodie} t={t} blink={blink} glow={glow} uv={uv} />
      </g>
      {prop && s.prop ? (
        <g transform={`translate(${prop.x} ${prop.y}) rotate(${prop.spin}) scale(1.1)`}>
          <PropArt kind={s.prop.kind} t={s.effect === "slowmo" ? t * 0.15 : t} uv={uv} />
        </g>
      ) : null}
      <Effect p={p} t={t} seed={ep.seed} target={target} />
      {label && labelAt ? (
        <g opacity={Math.min(1, Math.max(0, labelIn))}>
          <line x1={labelAt.x + 20} y1={labelAt.y - 20} x2={Math.min(W - 260, labelAt.x + 150)} y2={labelAt.y - 130} stroke="#F4F4F6" strokeWidth={5} />
          <circle cx={labelAt.x + 20} cy={labelAt.y - 20} r={9} fill="#F4F4F6" />
          <text
            x={Math.min(W - 260, labelAt.x + 150) + 10}
            y={labelAt.y - 140}
            fontFamily={UI_FONT}
            fontSize={54}
            fontWeight={700}
            fill="#F4F4F6"
            stroke="#0B0B10"
            strokeWidth={10}
            paintOrder="stroke"
            style={{ letterSpacing: "0.06em" }}
          >
            {label.text}
          </text>
        </g>
      ) : null}
    </svg>
  );
};

/** The flip scoreboard and the cause → effect chain, shown above the hero for their scene's line. */
const Devices: React.FC<{ p: Placed; t: number; fade: number }> = ({ p, t, fade }) => {
  const { fps } = useVideoConfig();
  const s = p.scene;
  const out = interpolate(t, [p.to - 0.2, p.to], [1, 0], clamp) * fade;
  if (s.score) {
    const flip = spring({ frame: Math.round((t - p.from - 0.35) * fps), fps, config: { damping: 14, stiffness: 160 } });
    const card = (text: string, k: number) => (
      <div style={{ position: "relative", width: 180, height: 210, borderRadius: 20, background: "#F4EBD8", boxShadow: "0 12px 0 rgba(0,0,0,0.35)", overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 136,
            fontWeight: 700,
            color: "#23233F",
            transform: `perspective(600px) rotateX(${(1 - Math.min(1, Math.max(0, flip - k * 0.15))) * -90}deg)`,
            transformOrigin: "50% 0%",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {text}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 103, height: 4, background: "rgba(35,35,63,0.25)" }} />
      </div>
    );
    return (
      <div style={{ position: "absolute", left: 0, right: 0, top: 190, display: "flex", justifyContent: "center", alignItems: "center", gap: 26, opacity: out }}>
        <div style={{ padding: 20, borderRadius: 28, background: "#5A3E2B", display: "flex", gap: 26, alignItems: "center", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
          {card(s.score[0], 0)}
          <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, background: "#F4EBD8" }} />
            <div style={{ width: 22, height: 22, borderRadius: 11, background: "#F4EBD8" }} />
          </div>
          {card(s.score[1], 1)}
        </div>
      </div>
    );
  }
  if (s.chain) {
    return (
      <div style={{ position: "absolute", left: 40, right: 40, top: 300, display: "flex", justifyContent: "center", alignItems: "center", gap: 12, opacity: out }}>
        {s.chain.map((step, i) => {
          const at = p.from + 0.5 + i * 0.65;
          const lit = spring({ frame: Math.round((t - at) * fps), fps, config: { damping: 12 } });
          const on = t >= at;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {i > 0 ? (
                <svg width={46} height={40} viewBox="0 0 46 40" style={{ opacity: on ? 1 : 0.35 }}>
                  <path d="M 2 20 H 34 M 22 6 L 38 20 L 22 34" stroke={on ? PAL.gold : "#F4F4F6"} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
              <div
                style={{
                  padding: "16px 26px 20px",
                  borderRadius: 999,
                  background: on ? PAL.gold : "rgba(14,18,28,0.85)",
                  border: `4px solid ${on ? PAL.gold : "rgba(244,244,246,0.4)"}`,
                  color: on ? "#111014" : "#F4F4F6",
                  fontSize: 44,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  transform: `scale(${on ? 0.9 + 0.1 * Math.min(1.2, lit) : 0.9})`,
                  whiteSpace: "nowrap",
                }}
              >
                {step}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

const EffectChip: React.FC<{ p: Placed; t: number; fade: number }> = ({ p, t, fade }) => {
  const text = p.scene.effect === "slowmo" ? "SLOW MOTION" : p.scene.effect === "uv" ? "UV VISION" : null;
  if (!text) return null;
  const on = interpolate(t, [p.from + 0.2, p.from + 0.5, p.to - 0.2, p.to], [0, 1, 1, 0], clamp) * fade;
  const colour = p.scene.effect === "uv" ? "#B57BFF" : "#9EE6FF";
  return (
    <div style={{ position: "absolute", left: 56, top: 140, opacity: on, display: "flex", alignItems: "center", gap: 14, padding: "10px 24px", borderRadius: 999, background: PAL.card, border: `3px solid ${colour}`, fontSize: 32, fontWeight: 700, color: colour, letterSpacing: "0.08em" }}>
      <div style={{ width: 16, height: 16, borderRadius: 8, background: colour, opacity: 0.5 + 0.5 * Math.sin(t * 6) }} />
      {text}
    </div>
  );
};

export const Story: React.FC<StoryEpisode> = (props) => {
  // Episode files passed with --props arrive without the schema's defaults (pose, camera, hoodie…): apply them here.
  const ep = useMemo(() => storySchema.parse(props), [props]);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const vt = visualTime(ep, t);
  const p = placedAt(ep, vt);
  // While a new scene fades in, the previous one stays underneath it.
  const under = vt - p.from < FADE && p.from > 0 ? placedAt(ep, p.from - 0.01) : null;
  const hudFade = (1 - skitIn(ep, t)) * (1 - bannerIn(ep, t));

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: UI_FONT, color: PAL.white }}>
      <div style={{ position: "absolute", inset: 0, ...cameraStyle(ep, t) }}>
        {under ? <SceneView ep={ep} p={under} t={vt} /> : null}
        <SceneView ep={ep} p={p} t={vt} />
      </div>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 42%, transparent 55%, rgba(6,4,20,0.55) 100%)", pointerEvents: "none" }} />

      <Devices p={p} t={vt} fade={hudFade} />
      <EffectChip p={p} t={vt} fade={hudFade} />
      <Beats ep={ep} t={t} font={UI_FONT} top={300} />
      <PopCaptions ep={ep} t={t} font={UI_FONT} bottom={400} />
      <HookLayer ep={ep} t={t} font={UI_FONT} />

      <Skit ep={ep} font={UI_FONT} />
      {ep.music ? <Audio src={staticFile(ep.music)} volume={(f) => musicVolume(ep, f / fps)} /> : null}
      {ep.voiceover ? <Audio src={staticFile(ep.voiceover)} volume={VOICE_VOLUME} /> : null}
    </AbsoluteFill>
  );
};
