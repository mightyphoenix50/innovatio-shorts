import { interpolate, spring, useVideoConfig } from "remotion";
import { z } from "zod";

/**
 * The editing layer every template shares: the hook, pop captions, micro-beats and camera punches.
 *
 * Hook (episode field `hook`):
 *   - cold open: for the first `coldOpen` seconds the picture flashes forward to the episode's most extreme
 *     moment (`previewLine`) with a big stamp (`flash`), while the voice reads the hook line;
 *   - whip-cut back to the start with a white flash;
 *   - the question the video answers (`banner`) pops in word by word and holds until the hook line ends.
 * Beats (narration[i].beats): small things that land on a spoken word, so something new appears every
 *   1–2 seconds: a number counting up (stat), a size comparison against something familiar (compare),
 *   a slammed word with a camera punch (stamp), or a red warning pill (warning).
 * Captions: big bold words that pop in as they're spoken, 1–3 at a time, current word in gold.
 */

const wordTiming = z.object({ start: z.number(), end: z.number(), char: z.number(), len: z.number() });

export const compareIcons = ["tower", "mountain", "plane", "ship", "person", "building", "whale", "rocket", "moon", "land"] as const;

export const beatSchema = z.object({
  /** The spoken word the beat lands on (first match in the line). Or `at`: seconds after the line starts. */
  word: z.string().optional(),
  at: z.number().optional(),
  kind: z.enum(["stat", "compare", "stamp", "warning"]),
  /** stat: the number with its unit, e.g. "3,800 m" or "380×". stamp/warning: the text, e.g. "TOTAL DARKNESS". */
  value: z.string().optional(),
  /** stat: the small line under the number, e.g. "below the surface". */
  label: z.string().optional(),
  /** compare: something familiar vs. the subject, in the same unit. */
  compare: z
    .object({
      name: z.string(),
      value: z.number(),
      icon: z.enum(compareIcons),
      subject: z.string(),
      subjectValue: z.number(),
      unit: z.string(),
      /** One short punchline under the bars, e.g. "Everest would vanish". */
      note: z.string().optional(),
    })
    .optional(),
});

export const hookSchema = z
  .object({
    /** The question the video answers, shown big while the hook line plays. ≤ 8 words, ends in "?" or "!". */
    banner: z.string(),
    /** Big stamp over the cold open, e.g. "3,800 m DOWN". ≤ 18 characters. */
    flash: z.string().optional(),
    /** Narration line whose moment the cold open flashes forward to (usually the climax). */
    previewLine: z.number().int().optional(),
    /** Length of the cold open in seconds. */
    coldOpen: z.number().default(1.3),
  })
  .optional();

export type Beat = z.infer<typeof beatSchema>;
export type Hook = NonNullable<z.infer<typeof hookSchema>>;
type Words = z.infer<typeof wordTiming>[];
export type EditLine = { from: number; to: number; heading: string; text: string; source?: string; words?: Words; beats?: Beat[] };
export type EditEpisode = { narration: EditLine[]; hook?: Hook };

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const C = { gold: "#E9C46A", red: "#E63946", white: "#F4F4F6", ink: "#111014", card: "rgba(14,18,28,0.9)" };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Each word's start/end and text. Before the voice exists, spreads the words evenly over the line. */
export const wordsOf = (line: EditLine) => {
  if (line.words?.length) {
    return line.words.map((w) => ({ ...w, text: line.text.slice(w.char, w.char + w.len) }));
  }
  const out: { start: number; end: number; char: number; len: number; text: string }[] = [];
  const re = /\S+/g;
  const parts: { char: number; len: number; text: string }[] = [];
  for (let m = re.exec(line.text); m; m = re.exec(line.text)) parts.push({ char: m.index, len: m[0].length, text: m[0] });
  const a = line.from + 0.15;
  const b = Math.max(a + 0.5, line.to - 0.45);
  parts.forEach((p, i) => {
    const s = a + ((b - a) * i) / parts.length;
    out.push({ ...p, start: s, end: s + (b - a) / parts.length });
  });
  return out;
};

/** When a beat lands: on its word's start if it has one, else `at` seconds into the line. */
export const beatTime = (line: EditLine, beat: Beat) => {
  if (beat.word) {
    const target = norm(beat.word.split(/\s+/)[0]);
    const w = wordsOf(line).find((x) => norm(x.text) === target) ?? wordsOf(line).find((x) => norm(x.text).startsWith(target));
    if (w) return w.start;
  }
  return line.from + (beat.at ?? 0.6);
};

const allBeats = (ep: EditEpisode) =>
  ep.narration.flatMap((line, li) => (line.beats ?? []).map((b, bi) => ({ b, li, bi, t: beatTime(line, b), line })));

// ---- Hook timing ---------------------------------------------------------------------------------------

export const coldOpenLength = (ep: EditEpisode) =>
  ep.hook && ep.hook.previewLine !== undefined && ep.narration[ep.hook.previewLine] ? ep.hook.coldOpen ?? 1.3 : 0;

/** The time the picture shows. During the cold open it is a moment from later in the episode. */
export const visualTime = (ep: EditEpisode, t: number) => {
  const len = coldOpenLength(ep);
  if (!len || t >= len || !ep.hook || ep.hook.previewLine === undefined) return t;
  const target = ep.narration[ep.hook.previewLine];
  return Math.min(target.to - 0.2, target.from + 2.8) - len + t;
};

/** 0..1 while the question banner is on screen; templates fade their HUD with (1 - this). */
export const bannerIn = (ep: EditEpisode, t: number) => {
  if (!ep.hook?.banner) return 0;
  const start = coldOpenLength(ep);
  const end = Math.max(start + 1.6, ep.narration[0].to - 0.1);
  return interpolate(t, [start, start + 0.15, end - 0.35, end], [0, 1, 1, 0], clamp);
};

// ---- Camera -----------------------------------------------------------------------------------------------

/** CSS transform and filter for the picture layer: punch-ins and shake on beats, and the whip at the cut. */
export const cameraStyle = (ep: EditEpisode, t: number): React.CSSProperties => {
  let scale = 1;
  let dx = 0;
  let dy = 0;
  for (const { b, t: bt } of allBeats(ep)) {
    const k = t - bt;
    if (k < -0.05 || k > 1.2) continue;
    const strength = b.kind === "stamp" ? 0.075 : b.kind === "warning" ? 0.03 : 0.025;
    const env = k < 0.12 ? interpolate(k, [-0.05, 0.12], [0, 1], clamp) : interpolate(k, [0.12, 1.2], [1, 0], clamp);
    scale += strength * env * env;
    if (b.kind === "stamp" && k >= 0 && k < 0.4) {
      const d = 1 - k / 0.4;
      dx += Math.sin(k * 95) * 12 * d;
      dy += Math.cos(k * 83) * 9 * d;
    }
  }
  let blur = 0;
  const cut = coldOpenLength(ep);
  if (cut) {
    blur = interpolate(t, [cut - 0.12, cut, cut + 0.14], [0, 16, 0], clamp);
    scale *= interpolate(t, [cut - 0.12, cut, cut + 0.3], [1, 1.12, 1], clamp);
  }
  return { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, filter: blur > 0.3 ? `blur(${blur}px)` : undefined, transformOrigin: "50% 45%" };
};

// ---- Hook layer ---------------------------------------------------------------------------------------------

export const HookLayer: React.FC<{ ep: EditEpisode; t: number; font: string }> = ({ ep, t, font }) => {
  const { fps, width } = useVideoConfig();
  const hook = ep.hook;
  if (!hook) return null;
  const cut = coldOpenLength(ep);
  const flashIn = spring({ frame: Math.round((t - 0.08) * fps), fps, config: { damping: 11, mass: 0.6 } });
  const white = cut ? interpolate(t, [cut - 0.04, cut, cut + 0.16], [0, 0.85, 0], clamp) : 0;
  const banner = bannerIn(ep, t);
  const bannerStart = cut;
  const words = hook.banner.split(/\s+/);
  const lift = interpolate(banner, [0, 1], [-30, 0]);
  return (
    <>
      {t < cut ? (
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)" }}>
          {hook.flash ? (
            <div style={{ position: "absolute", left: 0, right: 0, top: 330, display: "flex", justifyContent: "center" }}>
              <div
                style={{
                  fontFamily: font,
                  fontSize: 132,
                  fontWeight: 800,
                  color: C.white,
                  padding: "6px 34px 12px",
                  background: C.red,
                  transform: `rotate(-4deg) scale(${interpolate(flashIn, [0, 1], [2.2, 1])})`,
                  opacity: Math.min(1, flashIn * 1.5),
                  boxShadow: "0 18px 50px rgba(0,0,0,0.5)",
                  letterSpacing: "0.02em",
                  whiteSpace: "nowrap",
                }}
              >
                {hook.flash}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {banner > 0 ? (
        <div style={{ position: "absolute", left: 60, right: 60, top: 300, display: "flex", justifyContent: "center", opacity: banner, transform: `translateY(${lift}px)` }}>
          <div
            style={{
              maxWidth: width - 120,
              textAlign: "center",
              padding: "26px 38px 30px",
              borderRadius: 28,
              background: C.card,
              border: `4px solid ${C.gold}`,
              boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
              fontFamily: font,
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.08,
              color: C.white,
            }}
          >
            {words.map((w, i) => {
              const s = spring({ frame: Math.round((t - bannerStart - 0.05 - i * 0.07) * fps), fps, config: { damping: 12 } });
              const last = i === words.length - 1;
              return (
                <span key={i} style={{ display: "inline-block", transform: `scale(${Math.max(0, s)})`, opacity: Math.min(1, s * 1.4), marginRight: last ? 0 : "0.25em", color: last ? C.gold : C.white }}>
                  {w}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
      {white > 0 ? <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: white }} /> : null}
    </>
  );
};

// ---- Pop captions -------------------------------------------------------------------------------------------

/** Groups a line's words into 1–3 word chunks, breaking after punctuation. */
const chunksOf = (line: EditLine) => {
  const words = wordsOf(line);
  const chunks: (typeof words)[] = [];
  let cur: typeof words = [];
  for (const w of words) {
    cur.push(w);
    const brk = /[.,?!:;…]$/.test(w.text) || cur.length >= 3 || (cur.length >= 2 && w.text.length > 9);
    if (brk) {
      chunks.push(cur);
      cur = [];
    }
  }
  if (cur.length) chunks.push(cur);
  return chunks;
};

export const PopCaptions: React.FC<{ ep: EditEpisode; t: number; font: string; bottom?: number; fade?: number }> = ({ ep, t, font, bottom = 430, fade = 1 }) => {
  const { fps } = useVideoConfig();
  const line = ep.narration.find((n) => t >= n.from && t < n.to);
  if (!line) return null;
  const chunks = chunksOf(line);
  const idx = chunks.findIndex((c, i) => t >= c[0].start - 0.06 && (i === chunks.length - 1 || t < chunks[i + 1][0].start - 0.06));
  const chunk = chunks[Math.max(0, idx)];
  if (idx < 0 && t < chunks[0][0].start - 0.06) {
    // before the first word: show nothing but the heading
  }
  const lineIn = interpolate(t, [line.from, line.from + 0.2, line.to - 0.15, line.to], [0, 1, 1, 0], clamp) * fade;
  const headIn = spring({ frame: Math.round((t - line.from) * fps), fps, config: { damping: 14 } });
  return (
    <div style={{ position: "absolute", left: 40, right: 150, bottom, display: "flex", flexDirection: "column", alignItems: "center", opacity: lineIn }}>
      <div
        style={{
          fontFamily: font,
          fontSize: 34,
          fontWeight: 700,
          color: C.ink,
          background: C.gold,
          padding: "6px 22px 8px",
          borderRadius: 999,
          marginBottom: 18,
          transform: `scale(${Math.max(0, headIn)})`,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {line.heading}
      </div>
      <div style={{ textAlign: "center", height: 250, width: "100%", display: "flex", flexWrap: "wrap", justifyContent: "center", alignContent: "flex-end" }}>
        {idx >= 0
          ? chunk.map((w, i) => {
              const s = spring({ frame: Math.round((t - w.start + 0.04) * fps), fps, config: { damping: 11, mass: 0.5 } });
              const active = t >= w.start - 0.02 && t < w.end + 0.08;
              const shown = t >= w.start - 0.04;
              return (
                <span
                  key={`${idx}-${i}`}
                  style={{
                    display: "inline-block",
                    margin: "0 0.14em",
                    fontFamily: font,
                    fontSize: 104,
                    fontWeight: 800,
                    lineHeight: 1.12,
                    color: active ? C.gold : C.white,
                    WebkitTextStroke: "14px #0B0B10",
                    paintOrder: "stroke fill",
                    textShadow: "0 8px 22px rgba(0,0,0,0.55)",
                    opacity: shown ? 1 : 0,
                    transform: `scale(${shown ? interpolate(s, [0, 1], [0.55, active ? 1.08 : 1]) : 0.55})`,
                  }}
                >
                  {w.text}
                </span>
              );
            })
          : null}
      </div>
      {line.source ? (
        <div style={{ marginTop: 6, fontFamily: font, fontSize: 24, fontWeight: 500, color: C.ink, background: "rgba(244,244,246,0.9)", padding: "4px 16px", borderRadius: 999 }}>
          Source: {line.source}
        </div>
      ) : null}
    </div>
  );
};

// ---- Beats -----------------------------------------------------------------------------------------------------

const parseNumber = (v: string) => {
  const m = v.match(/^(.*?)(-?\d[\d,]*(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  const raw = m[2].replace(/,/g, "");
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  return { prefix: m[1], value: parseFloat(raw), decimals, suffix: m[3], comma: m[2].includes(",") };
};

const fmtNum = (n: number, decimals: number, comma: boolean) => {
  const s = n.toFixed(decimals);
  return comma ? Number(s).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : s;
};

const Icon: React.FC<{ kind: (typeof compareIcons)[number]; size: number; colour: string }> = ({ kind, size, colour }) => {
  const p = { fill: colour };
  const shapes: Record<string, React.ReactNode> = {
    tower: <path d="M48 4 L54 40 L60 96 L36 96 L42 40 Z M30 96 H66 V100 H30 Z" {...p} />,
    mountain: <path d="M4 96 L38 24 L52 48 L64 30 L96 96 Z" {...p} />,
    plane: <path d="M8 54 L44 46 L60 12 L68 12 L62 46 L92 50 L92 58 L62 60 L68 90 L60 90 L44 62 L8 60 Z" {...p} />,
    ship: <path d="M6 64 H94 L82 88 H18 Z M28 64 V44 H64 V64 Z M40 44 V28 H52 V44 Z" {...p} />,
    person: <path d="M50 8 a12 12 0 1 1 0.1 0 Z M36 34 H64 L60 64 H56 L54 96 H46 L44 64 H40 Z" {...p} />,
    building: <path d="M22 96 V20 H62 V96 Z M66 96 V44 H84 V96 Z" {...p} />,
    whale: <path d="M6 54 C20 30 64 28 82 46 L96 34 L92 56 L96 76 L82 64 C64 84 22 80 6 54 Z" {...p} />,
    rocket: <path d="M50 4 C64 18 66 44 62 70 H38 C34 44 36 18 50 4 Z M38 70 L26 90 L40 82 Z M62 70 L74 90 L60 82 Z" {...p} />,
    moon: (
      <g>
        <circle cx={50} cy={50} r={44} {...p} />
        <circle cx={34} cy={38} r={9} fill="rgba(0,0,0,0.22)" />
        <circle cx={62} cy={62} r={12} fill="rgba(0,0,0,0.22)" />
        <circle cx={64} cy={30} r={6} fill="rgba(0,0,0,0.22)" />
      </g>
    ),
    land: <path d="M10 60 C14 40 30 30 44 36 C52 20 74 22 80 38 C94 40 96 60 86 68 C78 82 56 80 48 74 C34 84 12 78 10 60 Z" {...p} />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {shapes[kind]}
    </svg>
  );
};

/** Beats sit in a band above the captions (captions own roughly y 1150–1520 at 1080×1920). */
export const Beats: React.FC<{ ep: EditEpisode; t: number; font: string; top?: number; fade?: number }> = ({ ep, t, font, top = 840, fade = 1 }) => {
  const { fps, width } = useVideoConfig();
  const beats = allBeats(ep);
  return (
    <>
      {beats.map(({ b, t: bt, line, li, bi }, i) => {
        const next = beats[i + 1];
        const hold = Math.min(2.6, Math.max(1.4, (next && next.li === li ? next.t : line.to) - bt - 0.05));
        const end = Math.min(bt + hold, line.to);
        if (t < bt - 0.05 || t > end) return null;
        const s = spring({ frame: Math.round((t - bt) * fps), fps, config: { damping: 12, mass: 0.6 } });
        const out = interpolate(t, [end - 0.18, end], [1, 0], clamp);
        const o = Math.min(1, s * 1.6) * out * fade;
        const key = `${li}-${bi}`;
        if (b.kind === "stat" && b.value) {
          const n = parseNumber(b.value);
          const k = interpolate(t, [bt, bt + 0.7], [0, 1], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });
          const shown = n ? `${n.prefix}${fmtNum(n.value * k, n.decimals, n.comma)}${n.suffix}` : b.value;
          return (
            <div key={key} style={{ position: "absolute", left: 0, right: 0, top, display: "flex", justifyContent: "center", opacity: o }}>
              <div style={{ textAlign: "center", padding: "14px 40px 20px", borderRadius: 28, background: C.card, border: `4px solid ${C.gold}`, transform: `scale(${interpolate(s, [0, 1], [0.6, 1])})`, fontFamily: font }}>
                <div style={{ fontSize: 120, fontWeight: 800, lineHeight: 1, color: C.white, fontVariantNumeric: "tabular-nums" }}>{shown}</div>
                {b.label ? <div style={{ marginTop: 6, fontSize: 36, fontWeight: 600, color: C.gold }}>{b.label}</div> : null}
              </div>
            </div>
          );
        }
        if (b.kind === "compare" && b.compare) {
          const c = b.compare;
          const max = Math.max(c.value, c.subjectValue);
          const fill = interpolate(t, [bt + 0.15, bt + 0.9], [0, 1], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });
          const barW = width - 360;
          const row = (name: string, value: number, colour: string, icon: React.ReactNode, f: number) => (
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10 }}>
              <div style={{ width: 70, display: "flex", justifyContent: "center" }}>{icon}</div>
              <div>
                <div style={{ fontSize: 32, fontWeight: 700, color: C.white }}>
                  {name} <span style={{ color: colour }}>· {value.toLocaleString("en-US")} {c.unit}</span>
                </div>
                <div style={{ marginTop: 6, width: barW, height: 26, borderRadius: 13, background: "rgba(255,255,255,0.12)" }}>
                  <div style={{ width: Math.max(10, (barW * value * f) / max), height: 26, borderRadius: 13, background: colour }} />
                </div>
              </div>
            </div>
          );
          return (
            <div key={key} style={{ position: "absolute", left: 40, right: 40, top: top - 60, display: "flex", justifyContent: "center", opacity: o }}>
              <div style={{ padding: "18px 30px 26px", borderRadius: 28, background: C.card, border: `4px solid ${C.gold}`, transform: `scale(${interpolate(s, [0, 1], [0.7, 1])})`, fontFamily: font }}>
                {row(c.name, c.value, "#9BB4D6", <Icon kind={c.icon} size={64} colour="#9BB4D6" />, Math.min(1, fill * 1.4))}
                {row(c.subject, c.subjectValue, C.gold, <div style={{ width: 30, height: 30, borderRadius: 15, background: C.gold }} />, fill)}
                {c.note ? (
                  <div style={{ marginTop: 14, textAlign: "center", fontSize: 40, fontWeight: 800, color: C.gold, opacity: interpolate(t, [bt + 0.8, bt + 1.0], [0, 1], clamp) }}>
                    {c.note}
                  </div>
                ) : null}
              </div>
            </div>
          );
        }
        if (b.kind === "stamp" && b.value) {
          return (
            <div key={key} style={{ position: "absolute", left: 0, right: 0, top: top + 20, display: "flex", justifyContent: "center", opacity: o }}>
              <div
                style={{
                  fontFamily: font,
                  fontSize: 96,
                  fontWeight: 800,
                  color: C.ink,
                  background: C.gold,
                  padding: "4px 30px 10px",
                  transform: `rotate(-3deg) scale(${interpolate(s, [0, 1], [2.0, 1])})`,
                  boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
                  whiteSpace: "nowrap",
                }}
              >
                {b.value}
              </div>
            </div>
          );
        }
        if (b.kind === "warning" && b.value) {
          const slide = interpolate(s, [0, 1], [-80, 0]);
          return (
            <div key={key} style={{ position: "absolute", left: 0, right: 0, top: top + 40, display: "flex", justifyContent: "center", opacity: o }}>
              <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 30px", borderRadius: 999, background: C.red, transform: `translateX(${slide}px)`, fontFamily: font, fontSize: 48, fontWeight: 800, color: "#fff" }}>
                <svg width={52} height={52} viewBox="0 0 100 100">
                  <path d="M50 6 L96 92 H4 Z" fill="#fff" />
                  <path d="M46 36 H54 L52 66 H48 Z M50 74 a5 5 0 1 1 0.1 0 Z" fill={C.red} />
                </svg>
                {b.value}
              </div>
            </div>
          );
        }
        return null;
      })}
    </>
  );
};
