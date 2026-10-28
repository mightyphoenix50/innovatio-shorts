import { loadFont } from "@remotion/fonts";
import { Audio } from "@remotion/media";
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { useMemo } from "react";
import { AbsoluteFill, Easing, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { PAL, UI_FONT } from "../fall/drawFall";
import { ringTexture, surfaceTexture, toonRamp, cloudTexture } from "../orbit/textures";
import type { OrbitEpisode } from "../orbit/types";
import { Beats, HookLayer, PopCaptions, bannerIn, cameraStyle, coldOpenLength, visualTime } from "../shared/Edit";
import { Skit, skitDuck, skitIn } from "../shared/Skit";
import { scaleSchema, type ScaleEpisode, type ScaleObject } from "./types";

for (const weight of ["500", "700"]) {
  loadFont({ family: UI_FONT, url: staticFile(`fonts/outfit-latin-${weight}-normal.woff2`), weight });
}

const FOV = 35;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const LIFT = 120; // the row of objects sits this many px above centre, clear of the captions
const FRAME = 8.1; // camera distance in object radii: the focused object fills about 70% of the width
const SHIFT_PX = 90; // the focused object sits a little right of centre, so the smaller ones show on the left
const VOICE_VOLUME = 0.88;
const MUSIC_FULL = 0.75;
const MUSIC_DUCKED = 0.35;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const smooth = (x: number) => x * x * (3 - 2 * x);

/** Each object's position along the row, in km: side by side, each with a small gap before it. */
const layout = (objects: ScaleObject[]) => {
  const xs: number[] = [];
  objects.forEach((o, i) => {
    if (i === 0) xs.push(0);
    else xs.push(xs[i - 1] + objects[i - 1].radiusKm + o.radiusKm * 0.3 + o.radiusKm);
  });
  return xs;
};

/** Camera at time t: distance in km and the x it looks at, flying from object to object as their lines start. */
const cameraAt = (ep: ScaleEpisode, t: number, height: number) => {
  const xs = layout(ep.objects);
  const ppu = height / 2 / TAN;
  const view = (i: number) => {
    const d = ep.objects[i].radiusKm * FRAME;
    return { d, x: xs[i] - (SHIFT_PX / ppu) * d };
  };
  let i = 0;
  for (let k = 0; k < ep.objects.length; k++) if (t >= ep.narration[ep.objects[k].line].from) i = k;
  const line = ep.narration[ep.objects[i].line];
  const s = i === 0 ? 1 : smooth(Math.min(1, Math.max(0, (t - line.from - 0.15) / 1.7)));
  const a = view(Math.max(0, i - 1));
  const b = view(i);
  const logD = Math.log(a.d) + (Math.log(b.d) - Math.log(a.d)) * s;
  // A slow push-in while each object holds, so the picture never sits still.
  const hold = Math.min(1, Math.max(0, (t - line.from - 1.8) / 6));
  const d = Math.exp(logD) * (1 - 0.07 * hold);
  const x = a.x + (b.x - a.x) * (i === 0 ? 1 : s);
  return { d, x, focus: i, xs, ppu };
};

const STAR_COLOURS: [string, string, string] = ["#FFF1B8", "#FFC94D", "#FF8A2E"];

/** A star's surface: hot base colour, bright granules and a few darker spots. No bands, so it never reads as a planet. */
const starTexture = (colours: readonly string[], seed: string) => {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = colours[1];
  ctx.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 900; i++) {
    const x = random(`${seed}-gx${i}`) * 1024;
    const y = random(`${seed}-gy${i}`) * 512;
    const r = 4 + 10 * random(`${seed}-gr${i}`);
    ctx.globalAlpha = 0.25 + 0.35 * random(`${seed}-ga${i}`);
    ctx.fillStyle = colours[0];
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.6, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = colours[2];
  for (let i = 0; i < 7; i++) {
    const x = random(`${seed}-sx${i}`) * 1024;
    const y = 140 + random(`${seed}-sy${i}`) * 230;
    const r = 8 + 16 * random(`${seed}-sr${i}`);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.6, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const Body: React.FC<{ o: ScaleObject; seed: string; x: number; r: number; t: number; ramp: THREE.Texture }> = ({ o, seed, x, r, t, ramp }) => {
  const isStar = o.kind === "star";
  const surface = useMemo(
    () =>
      isStar
        ? starTexture(o.colours ?? STAR_COLOURS, `${seed}-${o.name}`)
        : surfaceTexture({ kind: o.kind, colours: o.colours } as unknown as OrbitEpisode["body"], `${seed}-${o.name}`),
    [o.kind, o.colours, o.name, seed, isStar],
  );
  const clouds = useMemo(() => (o.kind === "earth" ? cloudTexture(`${seed}-${o.name}`) : null), [o.kind, o.name, seed]);
  const rings = useMemo(() => (o.rings ? ringTexture(seed, o.colours ?? ["#E8D6B0", "#C9AE82", "#A88B62"]) : null), [o.rings, o.colours, seed]);
  const spin = t * 0.06 + random(`${seed}-${o.name}-spin`) * 6;
  return (
    <group position={[x, 0, 0]}>
      <group rotation={[0.18, spin, -0.12]}>
        <mesh>
          <sphereGeometry args={[r, 128, 96]} />
          {isStar ? <meshBasicMaterial map={surface} /> : <meshToonMaterial map={surface} gradientMap={ramp} />}
        </mesh>
        {isStar ? (
          <mesh>
            <sphereGeometry args={[r * 1.025, 96, 72]} />
            <meshBasicMaterial color={(o.colours ?? STAR_COLOURS)[0]} transparent opacity={0.28} depthWrite={false} side={THREE.BackSide} />
          </mesh>
        ) : null}
        {clouds ? (
          <mesh rotation={[0, t * 0.02, 0]}>
            <sphereGeometry args={[r * 1.012, 96, 72]} />
            <meshToonMaterial map={clouds} gradientMap={ramp} transparent depthWrite={false} />
          </mesh>
        ) : null}
        {rings ? (
          <mesh rotation={[Math.PI / 2.3, 0, 0]}>
            <ringGeometry args={[r * 1.35, r * 2.25, 192, 1]} />
            <meshBasicMaterial map={rings} transparent side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        ) : null}
      </group>
    </group>
  );
};

const CameraRig: React.FC = () => {
  const camera = useThree((s) => s.camera);
  camera.position.set(0, 0, 1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return null;
};

const STARS = 160;
const Space: React.FC<{ seed: string; t: number; logD: number }> = ({ seed, t, logD }) => (
  <>
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #120B33 0%, #22124F 55%, #2B1459 100%)" }} />
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 12% 18%, rgba(214,72,190,0.28), transparent 45%), radial-gradient(circle at 92% 80%, rgba(70,110,255,0.30), transparent 50%)",
      }}
    />
    <svg width={1080} height={1920} style={{ position: "absolute" }}>
      {Array.from({ length: STARS }, (_, i) => {
        const depth = random(`${seed}-sd${i}`);
        // Stars drift inward as the camera pulls back (parallax by depth), wrapping around the frame.
        const k = Math.exp(-(logD % 2.3) * (0.05 + depth * 0.12));
        const x = 540 + (random(`${seed}-sx${i}`) * 1080 - 540) * k;
        const y = 860 + (random(`${seed}-sy${i}`) * 1920 - 860) * k;
        const tw = 0.55 + 0.45 * Math.sin(t * 3.4 + random(`${seed}-sp${i}`) * 6.28);
        return <circle key={i} cx={x} cy={y} r={1 + depth * 2.6} fill="#fff" opacity={tw * (0.35 + depth * 0.6)} />;
      })}
    </svg>
  </>
);

const musicVolume = (ep: ScaleEpisode, t: number) => {
  let duck = 0;
  for (const n of ep.narration) {
    const start = n.words?.length ? n.words[0].start : n.from + 0.15;
    const end = n.words?.length ? n.words[n.words.length - 1].end : n.to - 0.45;
    duck = Math.max(duck, interpolate(t, [start - 0.15, start, end, end + 0.5], [0, 1, 1, 0], clamp));
  }
  duck = Math.max(duck, skitDuck(ep, t));
  return MUSIC_FULL + (MUSIC_DUCKED - MUSIC_FULL) * duck;
};

export const Scale: React.FC<ScaleEpisode> = (props) => {
  // Props from --props aren't run through the schema, so fill in its defaults here.
  const ep = useMemo(() => scaleSchema.parse(props), [props]);
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const vt = visualTime(ep, t);
  const cam = cameraAt(ep, vt, height);
  const ramp = useMemo(() => toonRamp(), []);
  const cy = height / 2 - LIFT;

  // Everything in units of the camera distance, centred on the camera: keeps the GPU's numbers small at any scale.
  const U = cam.d;
  const shown = ep.objects
    .map((o, j) => ({ o, j, x: (cam.xs[j] - cam.x) / U, r: o.radiusKm / U }))
    .filter((b) => b.r * cam.ppu > 0.6 && Math.abs(b.x) - b.r < 3);

  const focus = ep.objects[cam.focus];
  const focusLine = ep.narration[focus.line];
  const cut = coldOpenLength(ep);
  const cardIn =
    interpolate(t, [cut + 0.2, cut + 0.8], [0, 1], { ...clamp, easing: ease }) * (1 - skitIn(ep, t)) * (1 - bannerIn(ep, t)) * (t < cut ? 0 : 1);
  const valueIn = spring({ frame: Math.round((vt - focusLine.from - 0.6) * fps), fps, config: { damping: 14 } });

  return (
    <AbsoluteFill style={{ fontFamily: UI_FONT, color: PAL.white, backgroundColor: "#120B33" }}>
      <div style={{ position: "absolute", inset: 0, ...cameraStyle(ep, t) }}>
        <Space seed={ep.seed} t={vt} logD={Math.log(cam.d)} />
        {/* Glows: star coronas and atmospheres, drawn as soft halos behind the 3D layer */}
        {shown.map(({ o, j, x, r }) => {
          const isStar = o.kind === "star";
          const colour = o.glow ?? (isStar ? (o.colours ?? STAR_COLOURS)[1] : undefined);
          if (!colour) return null;
          const c = new THREE.Color(colour);
          const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
          const sx = width / 2 + x * cam.ppu;
          const rp = r * cam.ppu;
          const bg = isStar
            ? `radial-gradient(circle at ${sx}px ${cy}px, rgba(${rgb},0.9) ${rp * 0.98}px, rgba(${rgb},0.45) ${rp * 1.08}px, rgba(${rgb},0.16) ${rp * 1.45}px, rgba(${rgb},0) ${rp * 2.1}px)`
            : `radial-gradient(circle at ${sx}px ${cy}px, rgba(${rgb},0) ${rp * 0.93}px, rgba(${rgb},0.55) ${rp * 1.01}px, rgba(${rgb},0.16) ${rp * 1.16}px, rgba(${rgb},0) ${rp * 1.5}px)`;
          return <AbsoluteFill key={`g${j}`} style={{ background: bg }} />;
        })}
        <div style={{ position: "absolute", left: 0, top: -LIFT, width, height }}>
          <ThreeCanvas width={width} height={height} gl={{ alpha: true, antialias: true }} camera={{ fov: FOV, position: [0, 0, 1], near: 0.001, far: 50 }}>
            <CameraRig />
            <ambientLight intensity={0.35} color="#7B6BE0" />
            <directionalLight position={[-5, 2.5, 3]} intensity={2.7} color="#FFF3DC" />
            <directionalLight position={[5, 1, -3]} intensity={1.2} color="#7FD8FF" />
            {shown.map((b) => (
              <Body key={b.j} o={b.o} seed={ep.seed} x={b.x} r={b.r} t={vt} ramp={ramp} />
            ))}
          </ThreeCanvas>
        </div>

        {/* Labels under each object; a ring marks objects too small to see */}
        <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
          {shown.map(({ o, j, x, r }) => {
            if (j < cam.focus - 2) return null;
            const sx = width / 2 + x * cam.ppu;
            const rpx = r * cam.ppu;
            if (sx < -40 || sx > width + 40) return null;
            const tiny = rpx < 14;
            return tiny ? (
              <g key={j}>
                <circle cx={sx} cy={cy} r={22} fill="none" stroke={PAL.gold} strokeWidth={4} strokeDasharray="7 6" />
              </g>
            ) : null;
          })}
        </svg>
        {shown.map(({ o, j, x, r }) => {
          if (j !== cam.focus - 1) return null;
          const sx = width / 2 + x * cam.ppu;
          const rpx = r * cam.ppu;
          if (sx < 20 || sx > width - 20 || rpx > 520) return null;
          const below = cy + Math.max(rpx, 22) + 28;
          const w = o.name.length * 19 + 50;
          const focusOne = j === cam.focus;
          return (
            <div
              key={j}
              style={{
                position: "absolute",
                left: Math.max(20, Math.min(width - w - 20, sx - w / 2)),
                top: below,
                width: w,
                textAlign: "center",
                padding: "8px 18px",
                borderRadius: 999,
                background: PAL.card,
                border: `3px solid ${focusOne ? PAL.gold : "rgba(255,255,255,0.4)"}`,
                fontSize: 32,
                fontWeight: 700,
                opacity: focusOne ? 1 : 0.85,
                boxSizing: "border-box",
                whiteSpace: "nowrap",
              }}
            >
              {o.name}
            </div>
          );
        })}
      </div>

      {/* Stat card: the object in focus */}
      <div style={{ position: "absolute", left: 56, top: 130, opacity: cardIn, transform: `translateY(${(1 - cardIn) * -30}px)` }}>
        <div style={{ display: "inline-block", padding: "18px 34px 22px", borderRadius: 26, background: PAL.card, border: `3px solid ${PAL.gold}` }}>
          <div style={{ fontSize: 30, fontWeight: 500, color: PAL.gold, letterSpacing: "0.08em" }}>
            {focus.name.toUpperCase()} · {focus.caption.toUpperCase()}
          </div>
          <div key={cam.focus} style={{ fontSize: 104, fontWeight: 700, lineHeight: 1, transform: `scale(${0.85 + 0.15 * Math.min(1, valueIn)})`, transformOrigin: "left bottom" }}>
            {focus.value}
          </div>
        </div>
      </div>

      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 60%, rgba(8,2,30,0.5) 100%)", pointerEvents: "none" }} />
      <Beats ep={ep} t={t} font={UI_FONT} />
      <PopCaptions ep={ep} t={t} font={UI_FONT} bottom={400} />
      <HookLayer ep={ep} t={t} font={UI_FONT} />

      <Skit ep={ep} font={UI_FONT} />
      {ep.music ? <Audio src={staticFile(ep.music)} volume={(f) => musicVolume(ep, f / fps)} /> : null}
      {ep.voiceover ? <Audio src={staticFile(ep.voiceover)} volume={VOICE_VOLUME} /> : null}
    </AbsoluteFill>
  );
};
