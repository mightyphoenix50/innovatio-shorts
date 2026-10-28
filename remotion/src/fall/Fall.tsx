import { loadFont } from "@remotion/fonts";
import { Beats, HookLayer, PopCaptions, bannerIn, cameraStyle, visualTime } from "../shared/Edit";
import { Skit, skitDuck, skitIn } from "../shared/Skit";
import { Audio } from "@remotion/media";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { depthAt, drawDiagram, drawWorld, lerpTable, PAL, UI_FONT } from "./drawFall";
import { drawAtmosphere, drawRise } from "./drawRise";
import type { FallEpisode } from "./types";

for (const weight of ["500", "700"]) {
  loadFont({ family: UI_FONT, url: staticFile(`fonts/outfit-latin-${weight}-normal.woff2`), weight });
}

const SAFE_BOTTOM = 400;
const SAFE_RIGHT = 150;
const VOICE_VOLUME = 0.88;
const MUSIC_FULL = 0.75;
const MUSIC_DUCKED = 0.35;
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const fmtDepth = (m: number): [string, string] =>
  m < 10000 ? [Math.round(m).toLocaleString("en-US"), "m"] : [Math.round(m / 1000).toLocaleString("en-US"), "km"];

const fmtTemp = (c: number) => `${Math.round(c).toLocaleString("en-US")}°C`;
const fmtPercent = (p: number) =>
  p >= 10 ? `Air ${Math.round(p)}%` : p >= 1 ? `Air ${p.toFixed(1)}%` : p >= 0.01 ? `Air ${p.toPrecision(1)}%` : "Almost no air";
const fmtAtm = (a: number) =>
  a >= 1e6 ? `${(a / 1e6).toFixed(1)} million atm` : a >= 1e4 ? `${Math.round(a / 1000).toLocaleString("en-US")}k atm` : `${Math.round(a).toLocaleString("en-US")} atm`;

const musicVolume = (ep: FallEpisode, t: number) => {
  let duck = 0;
  for (const n of ep.narration) {
    const start = n.words?.length ? n.words[0].start : n.from + 0.15;
    const end = n.words?.length ? n.words[n.words.length - 1].end : n.to - 0.45;
    duck = Math.max(duck, interpolate(t, [start - 0.15, start, end, end + 0.5], [0, 1, 1, 0], clamp));
  }
  duck = Math.max(duck, skitDuck(ep, t));
  return MUSIC_FULL + (MUSIC_DUCKED - MUSIC_FULL) * duck;
};

const Chip: React.FC<{ children: React.ReactNode; accent?: string }> = ({ children, accent = PAL.gold }) => (
  <div
    style={{
      padding: "10px 24px",
      borderRadius: 999,
      background: PAL.card,
      border: `3px solid ${accent}`,
      fontSize: 34,
      fontWeight: 700,
      color: PAL.white,
      whiteSpace: "nowrap",
      fontVariantNumeric: "tabular-nums",
    }}
  >
    {children}
  </div>
);

export const Fall: React.FC<FallEpisode> = (ep) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const canvas = useRef<HTMLCanvasElement>(null);
  // The canvas labels need Outfit loaded before the first draw, or they fall back to a serif font.
  const [fontHandle] = useState(() => delayRender("Outfit for the canvas"));
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    Promise.all(["500", "700"].map((w) => document.fonts.load(`${w} 40px "${UI_FONT}"`)))
      .catch(() => undefined)
      .then(() => {
        setFontsReady(true);
        continueRender(fontHandle);
      });
  }, [fontHandle]);
  // During the cold open the picture flashes forward; everything visual uses vt, captions and audio use t.
  const vt = visualTime(ep, t);
  const diagramAlpha = ep.diagramAt === undefined ? 0 : interpolate(vt, [ep.diagramAt, ep.diagramAt + 0.7], [0, 1], clamp);

  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !fontsReady) return;
    if (ep.direction === "up") drawRise(ctx, ep, width, height, vt);
    else drawWorld(ctx, ep, width, height, vt);
    if (ep.diagram?.kind === "atmosphere") drawAtmosphere(ctx, ep, width, height, vt, diagramAlpha);
    else drawDiagram(ctx, ep, width, height, vt, diagramAlpha);
  }, [ep, vt, width, height, diagramAlpha, fontsReady]);

  const d = depthAt(ep, vt);
  const layer = ep.layers.find((L) => d < L.to) ?? ep.layers[ep.layers.length - 1];
  const temp = lerpTable(ep.temperature, d);
  const atm = lerpTable(ep.pressure, d);
  const [num, unit] = fmtDepth(d);
  const hudIn = interpolate(vt, [ep.fallAt - 0.4, ep.fallAt + 0.3], [0, 1], { ...clamp, easing: ease });
  const hudOpacity = hudIn * (1 - diagramAlpha) * (1 - skitIn(ep, t)) * (1 - bannerIn(ep, t));
  const hot = temp > 800 ? PAL.red : temp < 0 ? "#48CAE4" : PAL.gold;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: UI_FONT, color: PAL.white }}>
      <div style={{ position: "absolute", inset: 0, ...cameraStyle(ep, t) }}>
        <canvas ref={canvas} width={width} height={height} style={{ position: "absolute", inset: 0 }} />
      </div>

      {/* Depth card */}
      <div style={{ position: "absolute", left: 56, top: 130, opacity: hudOpacity, transform: `translateY(${(1 - hudIn) * -30}px)` }}>
        <div
          style={{
            display: "inline-block",
            padding: "18px 34px 22px",
            borderRadius: 26,
            background: PAL.card,
            border: `3px solid ${PAL.gold}`,
          }}
        >
          <div style={{ fontSize: 30, fontWeight: 500, color: PAL.gold, letterSpacing: "0.08em" }}>{ep.direction === "up" ? "ALTITUDE" : "DEPTH"}</div>
          <div style={{ fontSize: 120, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {num}
            <span style={{ fontSize: 52, marginLeft: 12, opacity: 0.75 }}>{unit}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 18, flexWrap: "wrap", maxWidth: width - 56 - SAFE_RIGHT }}>
          <Chip>{layer.name}</Chip>
          <Chip accent={hot}>{fmtTemp(temp)}</Chip>
          <Chip accent={PAL.teal}>{ep.pressureUnit === "percent" ? fmtPercent(atm) : fmtAtm(atm)}</Chip>
        </div>
      </div>

      <Beats ep={ep} t={t} font={UI_FONT} top={560} fade={1 - diagramAlpha * 0.4} />
      <PopCaptions ep={ep} t={t} font={UI_FONT} bottom={SAFE_BOTTOM} />
      <HookLayer ep={ep} t={t} font={UI_FONT} />

      <Skit ep={ep} font={UI_FONT} />
      {ep.music ? <Audio src={staticFile(ep.music)} volume={(f) => musicVolume(ep, f / fps)} /> : null}
      {ep.voiceover ? <Audio src={staticFile(ep.voiceover)} volume={VOICE_VOLUME} /> : null}
    </AbsoluteFill>
  );
};
