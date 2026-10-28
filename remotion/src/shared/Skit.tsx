import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";

/**
 * The end skit: after the last narration line, the channel's mascot, Bit (a small, original AI robot),
 * pops in and delivers a one-line joke in its own voice, then reacts.
 * Timing (from/to/words) is written by scripts/azure_voice.py; without a voice it gets a default slot.
 */
export const skitMoods = ["wink", "smug", "gasp", "shrug", "laugh"] as const;

export const skitSchema = z
  .object({
    /** What Bit says. One line, ≤ 16 words, kind, self-aware, tied to the episode's payoff. */
    text: z.string(),
    /** Bit's reaction on the last word: wink, smug, gasp, shrug or laugh. */
    mood: z.enum(skitMoods).default("wink"),
    /** Small stage direction shown under the bubble, e.g. "*winks*". Optional. */
    action: z.string().optional(),
    from: z.number().optional(),
    to: z.number().optional(),
    words: z.array(z.object({ start: z.number(), end: z.number(), char: z.number(), len: z.number() })).optional(),
  })
  .optional();

export type SkitData = NonNullable<z.infer<typeof skitSchema>>;

const SKIT_DEFAULT = 4.5;
const ENTER = 0.5; // the voice starts this long after Bit starts popping in

type Timed = { narration: { to: number }[]; skit?: SkitData };

/** When the skit runs. Before it has been voiced it starts right after the last line. */
export const skitSpan = (ep: Timed): [number, number] | null => {
  if (!ep.skit) return null;
  const from = ep.skit.from ?? ep.narration[ep.narration.length - 1].to;
  const to = ep.skit.to ?? from + SKIT_DEFAULT;
  return [from, to];
};

/** 0..1: how much the music should duck for Bit's line (the templates add this to their own ducking). */
/** 0..1 as the skit takes over the screen; templates fade their cards with it. */
export const skitIn = (ep: Timed, t: number) => {
  const span = skitSpan(ep);
  if (!span) return 0;
  return interpolate(t, [span[0], span[0] + 0.35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
};

export const skitDuck = (ep: Timed, t: number) => {
  const span = skitSpan(ep);
  if (!span) return 0;
  const w = ep.skit?.words;
  const start = w?.length ? w[0].start : span[0] + ENTER;
  const end = w?.length ? w[w.length - 1].end : span[1] - 1;
  const c = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  return interpolate(t, [start - 0.15, start, end, end + 0.5], [0, 1, 1, 0], c);
};

const C = {
  body: "#F4F4F6",
  shade: "#C9CBD6",
  screen: "#1A222F",
  eye: "#7FE3FF",
  cheek: "#FF8FA3",
  gold: "#E9C46A",
  ink: "#1F1E1E",
  card: "rgba(26,34,47,0.94)",
};

/** Bit: a round robot head with a screen face, antenna and two little arms. Drawn here, original to the channel. */
const Bit: React.FC<{ t: number; talking: boolean; mood: SkitData["mood"]; react: number; blink: boolean }> = ({ t, talking, mood, react, blink }) => {
  const mouthOpen = talking ? 0.35 + 0.65 * Math.abs(Math.sin(t * 22)) : 0;
  const wink = mood === "wink" ? react : 0;
  const gasp = mood === "gasp" ? react : 0;
  const smug = mood === "smug" ? react : 0;
  const laugh = mood === "laugh" ? react : 0;
  const shrug = mood === "shrug" ? react : 0;
  const eyeH = (open: number) => Math.max(3, 34 * open);
  const leftOpen = blink ? 0.08 : 1 - 0.55 * smug - 0.85 * laugh + 0.35 * gasp;
  const rightOpen = blink ? 0.08 : Math.max(0.06, 1 - wink - 0.55 * smug - 0.85 * laugh + 0.35 * gasp);
  const armUp = shrug * 60 + laugh * 25 * Math.abs(Math.sin(t * 14));
  const shake = laugh * Math.sin(t * 30) * 4;

  return (
    <svg width={360} height={420} viewBox="-180 -230 360 420" style={{ overflow: "visible" }}>
      {/* antenna */}
      <line x1={0} y1={-150} x2={0} y2={-200} stroke={C.shade} strokeWidth={10} strokeLinecap="round" />
      <circle cx={0} cy={-206} r={16 + 3 * Math.sin(t * 6)} fill={C.gold} />
      {/* arms */}
      <g transform={`rotate(${-20 + armUp} -128 60)`}>
        <rect x={-188} y={52} width={70} height={26} rx={13} fill={C.shade} />
        <circle cx={-188} cy={65} r={20} fill={C.body} stroke={C.shade} strokeWidth={6} />
      </g>
      <g transform={`rotate(${20 - armUp} 128 60)`}>
        <rect x={118} y={52} width={70} height={26} rx={13} fill={C.shade} />
        <circle cx={188} cy={65} r={20} fill={C.body} stroke={C.shade} strokeWidth={6} />
      </g>
      {/* head */}
      <g transform={`translate(${shake} 0)`}>
        <rect x={-140} y={-150} width={280} height={250} rx={90} fill={C.body} />
        <rect x={-140} y={20} width={280} height={80} rx={40} fill={C.shade} opacity={0.5} />
        <rect x={-112} y={-118} width={224} height={170} rx={64} fill={C.screen} />
        {/* eyes */}
        <rect x={-62 - 16} y={-48 - eyeH(leftOpen) / 2} width={32} height={eyeH(leftOpen)} rx={16} fill={C.eye} />
        {wink > 0.5 ? (
          <path d="M 30 -46 Q 46 -62 62 -46" stroke={C.eye} strokeWidth={9} fill="none" strokeLinecap="round" />
        ) : (
          <rect x={46 - 16} y={-48 - eyeH(rightOpen) / 2} width={32} height={eyeH(rightOpen)} rx={16} fill={C.eye} />
        )}
        {smug > 0.3 ? <path d="M 26 -86 L 70 -96" stroke={C.eye} strokeWidth={8} strokeLinecap="round" opacity={smug} /> : null}
        {/* cheeks */}
        <ellipse cx={-80} cy={0} rx={16} ry={9} fill={C.cheek} opacity={0.75} />
        <ellipse cx={80} cy={0} rx={16} ry={9} fill={C.cheek} opacity={0.75} />
        {/* mouth */}
        {gasp > 0.3 ? (
          <ellipse cx={0} cy={6} rx={16} ry={20 * gasp} fill={C.eye} />
        ) : talking ? (
          <rect x={-26} y={-2} width={52} height={6 + 26 * mouthOpen} rx={12} fill={C.eye} />
        ) : (
          <path d={`M -30 0 Q 0 ${22 + 10 * (laugh + smug + wink)} 30 ${smug > 0.3 ? -6 : 0}`} stroke={C.eye} strokeWidth={9} fill="none" strokeLinecap="round" />
        )}
      </g>
      {/* sparkle for the wink */}
      {wink > 0.2 ? (
        <path
          d="M 0 -22 L 6 -6 L 22 0 L 6 6 L 0 22 L -6 6 L -22 0 L -6 -6 Z"
          fill={C.gold}
          transform={`translate(110 -100) scale(${wink * (0.8 + 0.2 * Math.sin(t * 9))}) rotate(${t * 90})`}
        />
      ) : null}
    </svg>
  );
};

const SkitText: React.FC<{ skit: SkitData; t: number }> = ({ skit, t }) => {
  const words = skit.words;
  if (!words?.length) return <>{skit.text}</>;
  const spokenTo = words.filter((w) => w.start <= t).reduce((m, w) => Math.max(m, w.char + w.len), 0);
  return (
    <>
      <span>{skit.text.slice(0, spokenTo)}</span>
      <span style={{ opacity: 0.4 }}>{skit.text.slice(spokenTo)}</span>
    </>
  );
};

export const Skit: React.FC<{ ep: Timed; font: string }> = ({ ep, font }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const span = skitSpan(ep);
  if (!span || !ep.skit || t < span[0]) return null;
  const skit = ep.skit;
  const [from, to] = span;
  const local = Math.round((t - from) * fps);
  const pop = spring({ frame: local, fps, config: { damping: 11, stiffness: 140 } });
  const words = skit.words ?? [];
  const lastWordEnd = words.length ? words[words.length - 1].end : to - 1.2;
  const talking = words.length ? words.some((w) => t >= w.start && t < w.end) : t > from + ENTER && t < lastWordEnd;
  const react = spring({ frame: Math.round((t - lastWordEnd - 0.05) * fps), fps, config: { damping: 9 } });
  const blink = !talking && react < 0.05 && (t - from) % 2.7 > 2.55;
  const bubble = spring({ frame: local - Math.round(ENTER * fps * 0.6), fps, config: { damping: 13 } });
  const dim = interpolate(t, [from, from + 0.4], [0, 1], { extrapolateRight: "clamp" });
  const bob = Math.sin((t - from) * 3.2) * 8;
  const action = interpolate(t, [lastWordEnd, lastWordEnd + 0.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: font }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(10,6,30,0) 35%, rgba(10,6,30,0.65) 100%)", opacity: dim }} />
      {/* speech bubble */}
      <div
        style={{
          position: "absolute",
          left: 70,
          right: 150,
          bottom: 1010,
          transform: `scale(${bubble})`,
          transformOrigin: "75% 100%",
        }}
      >
        <div
          style={{
            padding: "28px 36px 32px",
            borderRadius: 34,
            background: C.body,
            color: C.ink,
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.16,
            boxShadow: "0 10px 0 rgba(10,6,30,0.35)",
            position: "relative",
          }}
        >
          <SkitText skit={skit} t={t} />
          <svg width={80} height={56} style={{ position: "absolute", right: 190, bottom: -50 }}>
            <path d="M 0 0 L 80 0 L 56 56 Z" fill={C.body} />
          </svg>
        </div>
        {skit.action ? (
          <div style={{ marginTop: 18, fontSize: 42, fontWeight: 700, color: C.gold, fontStyle: "italic", opacity: action, paddingLeft: 12 }}>
            {skit.action}
          </div>
        ) : null}
      </div>
      {/* Bit */}
      <div
        style={{
          position: "absolute",
          right: 200,
          bottom: 380,
          transform: `translateY(${(1 - pop) * 800 + bob}px) rotate(${(1 - pop) * 25 - 4}deg) scale(${1.3 + 0.1 * pop})`,
          transformOrigin: "50% 100%",
        }}
      >
        <Bit t={t} talking={talking} mood={skit.mood ?? "wink"} react={Math.min(1, react)} blink={blink} />
      </div>
    </div>
  );
};
