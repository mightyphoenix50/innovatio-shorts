import { loadFont } from "@remotion/fonts";
import { Audio } from "@remotion/media";
import { useLayoutEffect, useRef } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { depthAt, drawFrame, FONT_FAMILY, lerpTable } from "./draw";
import type { Episode } from "./types";

const fontFamily = FONT_FAMILY;
for (const weight of ["500", "600"]) {
  loadFont({
    family: FONT_FAMILY,
    url: staticFile(`fonts/barlow-condensed-latin-${weight}-normal.woff2`),
    weight,
  });
}

const INK = "#e8f4fa";
const DIM = "#a8c8d6";
const GOLD = "#ffd37a";

// Shorts safe zones at 1080x1920: keep text out of the bottom ~420px and the right ~150px.
const SAFE_BOTTOM = 420;
const SAFE_RIGHT = 150;

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

const Gauge: React.FC<{ ep: Episode; depth: number; opacity: number }> = ({ ep, depth, opacity }) => {
  const x = 150;
  const y0 = 600;
  const y1 = 1150;
  const yy = (d: number) => y0 + ((y1 - y0) * d) / ep.maxDepth;
  const ticks = [0, 1000, 4000, 6000, ep.maxDepth];
  const cmp = ep.comparison;
  const cmpAlpha = cmp ? interpolate(depth, [cmp.showAfter, cmp.showAfter + 1200], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  return (
    <svg width={400} height={1400} style={{ position: "absolute", left: 0, top: 0, opacity }}>
      {ep.zones.map((z) => (
        <rect key={z.name} x={x - 5} y={yy(z.from)} width={10} height={yy(Math.min(z.to, ep.maxDepth)) - yy(z.from)} fill={z.colour} />
      ))}
      {ticks.map((d) => (
        <g key={d}>
          <rect x={x - 12} y={yy(d) - 1.5} width={24} height={3} fill={INK} opacity={0.7} />
          <text x={x - 24} y={yy(d) + 10} textAnchor="end" fill={INK} opacity={0.8} fontSize={30} fontFamily={fontFamily} fontWeight={500}>
            {d === 0 ? "0 m" : `${(d / 1000).toFixed(d % 1000 === 0 ? 0 : 1)} km`}
          </text>
        </g>
      ))}
      {cmp ? (
        <g opacity={cmpAlpha}>
          <path d={`M${x + 20} ${yy(ep.maxDepth)} L${x + 44} ${yy(ep.maxDepth - cmp.height)} L${x + 68} ${yy(ep.maxDepth)} Z`} fill="#ffffff" opacity={0.55} />
          <text x={x + 58} y={yy(ep.maxDepth - cmp.height) + 10} fill="#ffffff" fontSize={32} fontFamily={fontFamily} fontWeight={600}>
            {cmp.label}
          </text>
        </g>
      ) : null}
      <circle cx={x} cy={yy(depth)} r={13} fill={GOLD} />
    </svg>
  );
};

type Line = Episode["narration"][number];

/** Caption text. With word timings, spoken words turn solid and the current word turns gold. */
const CaptionText: React.FC<{ line: Line; t: number }> = ({ line, t }) => {
  if (!line.words?.length) return <>{line.text}</>;
  const spokenTo = line.words.filter((w) => w.start <= t).reduce((m, w) => Math.max(m, w.char + w.len), 0);
  const current = line.words.find((w) => w.start <= t && t < w.end + 0.08);
  if (!current) {
    return (
      <>
        <span>{line.text.slice(0, spokenTo)}</span>
        <span style={{ opacity: 0.5 }}>{line.text.slice(spokenTo)}</span>
      </>
    );
  }
  return (
    <>
      <span>{line.text.slice(0, current.char)}</span>
      <span style={{ color: GOLD }}>{line.text.slice(current.char, current.char + current.len)}</span>
      <span style={{ opacity: 0.5 }}>{line.text.slice(current.char + current.len)}</span>
    </>
  );
};

// About -1.1 dB, so voice and music together stay under YouTube's -1 dBTP peak guideline.
const VOICE_VOLUME = 0.88;
const MUSIC_FULL = 0.75;
const MUSIC_DUCKED = 0.35;

/** Music level at time t: dips under the voice, easing down in 0.15 s and back up over 0.5 s. */
const musicVolume = (ep: Episode, t: number) => {
  let duck = 0;
  for (const n of ep.narration) {
    const start = n.words?.length ? n.words[0].start : n.from + 0.15;
    const end = n.words?.length ? n.words[n.words.length - 1].end : n.to - 0.45;
    const v = interpolate(t, [start - 0.15, start, end, end + 0.5], [0, 1, 1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    duck = Math.max(duck, v);
  }
  return MUSIC_FULL + (MUSIC_DUCKED - MUSIC_FULL) * duck;
};

export const Descent: React.FC<Episode> = (ep) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const canvas = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx) drawFrame(ctx, ep, width, height, t);
  }, [ep, t, width, height]);

  const depth = depthAt(ep, t);
  const zone = ep.zones.find((z) => depth < z.to) ?? ep.zones[ep.zones.length - 1];
  const temp = lerpTable(ep.temperature, depth);
  const hudOpacity =
    ep.platesAt === undefined
      ? 1
      : interpolate(t, [ep.platesAt, ep.platesAt + 0.8], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const line = ep.narration.find((n) => t >= n.from && t < n.to);
  const lineOpacity = line
    ? interpolate(t, [line.from, line.from + 0.3, line.to - 0.25, line.to], [0, 1, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      })
    : 0;
  const lineRise = line
    ? interpolate(t, [line.from, line.from + 0.4], [24, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) })
    : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily, color: INK }}>
      <canvas ref={canvas} width={width} height={height} style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 640, opacity: hudOpacity, background: "linear-gradient(rgba(0,14,26,.62), rgba(0,14,26,0))" }} />

      <div style={{ position: "absolute", left: 64, top: 150, opacity: hudOpacity, textShadow: "0 2px 18px rgba(0,0,0,.7)" }}>
        <div style={{ fontSize: 190, fontWeight: 600, lineHeight: 0.9, letterSpacing: "0.01em", fontVariantNumeric: "tabular-nums" }}>
          {fmt(depth)}
          <span style={{ fontSize: 70, color: DIM, marginLeft: 12 }}>m</span>
        </div>
        <div style={{ marginTop: 18, fontSize: 46, fontWeight: 600, color: GOLD }}>{zone.name}</div>
        <div style={{ marginTop: 6, fontSize: 38, fontWeight: 500, color: INK, lineHeight: 1.3, fontVariantNumeric: "tabular-nums" }}>
          Pressure {fmt(1 + depth / 10)} atm
          <br />
          Water {temp.toFixed(1)}°C
        </div>
      </div>

      <Gauge ep={ep} depth={depth} opacity={hudOpacity} />

      {line ? (
        <div
          style={{
            position: "absolute",
            left: 56,
            right: SAFE_RIGHT,
            bottom: SAFE_BOTTOM,
            padding: "28px 34px 32px",
            borderRadius: 22,
            background: "rgba(2,12,22,.66)",
            opacity: lineOpacity,
            translate: `0px ${lineRise}px`,
          }}
        >
          <div style={{ fontSize: 50, fontWeight: 600, lineHeight: 1.05, color: GOLD, marginBottom: 10 }}>{line.heading}</div>
          <div style={{ fontSize: 56, fontWeight: 500, lineHeight: 1.16 }}><CaptionText line={line} t={t} /></div>
        </div>
      ) : null}

      {ep.music ? <Audio src={staticFile(ep.music)} volume={(f) => musicVolume(ep, f / fps)} /> : null}
      {ep.voiceover ? <Audio src={staticFile(ep.voiceover)} volume={VOICE_VOLUME} /> : null}
    </AbsoluteFill>
  );
};
