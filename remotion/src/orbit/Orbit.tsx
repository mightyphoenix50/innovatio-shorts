import { loadFont } from "@remotion/fonts";
import { Beats, HookLayer, PopCaptions, bannerIn, cameraStyle, coldOpenLength, visualTime } from "../shared/Edit";
import { Skit, skitDuck, skitIn } from "../shared/Skit";
import { Audio } from "@remotion/media";
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { useMemo } from "react";
import { AbsoluteFill, Easing, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { PAL, UI_FONT } from "../fall/drawFall";
import { cloudTexture, ringTexture, surfaceTexture, toonRamp } from "./textures";
import { orbitSchema, type OrbitEpisode } from "./types";
import { distanceAt, FOV, latLonToVec, LIFT, project, rotationAt, screenRadius, stopFor } from "./view";

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

const musicVolume = (ep: OrbitEpisode, t: number) => {
  let duck = 0;
  for (const n of ep.narration) {
    const start = n.words?.length ? n.words[0].start : n.from + 0.15;
    const end = n.words?.length ? n.words[n.words.length - 1].end : n.to - 0.45;
    duck = Math.max(duck, interpolate(t, [start - 0.15, start, end, end + 0.5], [0, 1, 1, 0], clamp));
  }
  duck = Math.max(duck, skitDuck(ep, t));
  return MUSIC_FULL + (MUSIC_DUCKED - MUSIC_FULL) * duck;
};

// ---------- 3D: the world ----------

const World: React.FC<{ ep: OrbitEpisode; t: number }> = ({ ep, t }) => {
  const { body, seed } = ep;
  const ramp = useMemo(() => toonRamp(), []);
  const surface = useMemo(() => surfaceTexture(body, seed), [body, seed]);
  const clouds = useMemo(() => (body.kind === "earth" ? cloudTexture(seed) : null), [body.kind, seed]);
  const rings = useMemo(() => (body.rings ? ringTexture(seed, body.colours ?? ["#E8D6B0", "#C9AE82", "#A88B62"]) : null), [body.rings, body.colours, seed]);
  const [rx, ry] = rotationAt(ep, t);
  const tilt = THREE.MathUtils.degToRad(-body.tilt * 0.35);
  const { fps } = useVideoConfig();
  const balls = ep.stops
    .filter((s) => s.ballKm)
    .map((s) => {
      const line = ep.narration[s.line];
      const grow = spring({ frame: Math.round((t - line.from - 1.6) * fps), fps, config: { damping: 13 } });
      return { ...s, r: (s.ballKm as number) / 2 / body.radiusKm, grow };
    });

  return (
    <group rotation={[0, 0, tilt]}>
      <group rotation={[rx, ry, 0]}>
        <mesh>
          {/* 160 x 120 segments: a smooth silhouette at full-screen zoom */}
          <sphereGeometry args={[1, 160, 120]} />
          <meshToonMaterial map={surface} gradientMap={ramp} />
        </mesh>
        {clouds ? (
          <mesh rotation={[0, t * 0.012, 0]}>
            <sphereGeometry args={[1.012, 128, 96]} />
            <meshToonMaterial map={clouds} gradientMap={ramp} transparent depthWrite={false} />
          </mesh>
        ) : null}
        {balls.map((b) => (
          <mesh key={b.line} position={latLonToVec(b.lat, b.lon, 1 + b.r * b.grow * 0.92).toArray()} scale={Math.max(0.001, b.grow)}>
            <sphereGeometry args={[b.r, 64, 48]} />
            <meshToonMaterial color="#6CD0FF" gradientMap={ramp} />
          </mesh>
        ))}
        {rings ? (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.35, 2.25, 256, 1]} />
            <meshBasicMaterial map={rings} transparent side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        ) : null}
      </group>
    </group>
  );
};

const SmallMoon: React.FC<{ t: number }> = ({ t }) => {
  const ramp = useMemo(() => toonRamp(), []);
  const a = 2.4 + t * 0.09;
  return (
    <group rotation={[0.32, 0, -0.18]}>
      <mesh position={[Math.cos(a) * 2.9, 0, Math.sin(a) * 2.9]}>
        <icosahedronGeometry args={[0.18, 6]} />
        <meshToonMaterial color="#B9B6C2" gradientMap={ramp} />
      </mesh>
    </group>
  );
};

// ---------- 2D layers ----------

const STAR_COUNT = 150;

const Space: React.FC<{ ep: OrbitEpisode; t: number; dist: number }> = ({ ep, t, dist }) => {
  const push = (12 - dist) / 8;
  return (
    <>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, #120B33 0%, #22124F 55%, #2B1459 100%)" }} />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 12% 18%, rgba(214,72,190,0.28), transparent 45%), radial-gradient(circle at 92% 80%, rgba(70,110,255,0.30), transparent 50%)",
        }}
      />
      <svg width={1080} height={1920} style={{ position: "absolute" }}>
        {Array.from({ length: STAR_COUNT }, (_, i) => {
          const depth = random(`${ep.seed}-sd${i}`);
          const k = 1 + push * (0.04 + depth * 0.12);
          const x = 540 + (random(`${ep.seed}-sx${i}`) * 1080 - 540) * k;
          const y = 860 + (random(`${ep.seed}-sy${i}`) * 1920 - 860) * k;
          const tw = 0.55 + 0.45 * Math.sin(t * 3.4 + random(`${ep.seed}-sp${i}`) * 6.28);
          return <circle key={i} cx={x} cy={y} r={1 + depth * 2.6} fill="#fff" opacity={tw * (0.35 + depth * 0.6)} />;
        })}
      </svg>
    </>
  );
};

const Glow: React.FC<{ colour: string; r: number }> = ({ colour, r }) => {
  const c = new THREE.Color(colour);
  const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 540px ${960 - LIFT}px, rgba(${rgb},0) ${r * 0.93}px, rgba(${rgb},0.55) ${r * 1.01}px, rgba(${rgb},0.16) ${r * 1.16}px, rgba(${rgb},0) ${r * 1.5}px)`,
      }}
    />
  );
};

const Pin: React.FC<{ ep: OrbitEpisode; t: number; lineIdx: number }> = ({ ep, t, lineIdx }) => {
  const { fps, width, height } = useVideoConfig();
  const stop = ep.stops.find((s) => s.line === lineIdx);
  if (!stop) return null;
  const line = ep.narration[lineIdx];
  const p = project(ep, t, stop.lat, stop.lon, width, height);
  const facingIn = interpolate(p.front, [0.15, 0.45], [0, 1], clamp);
  const appear = spring({ frame: Math.round((t - line.from - 0.9) * fps), fps, config: { damping: 12 } });
  const out = interpolate(t, [line.to - 0.3, line.to], [1, 0], clamp);
  const o = facingIn * Math.min(1, appear) * out;
  if (o <= 0.01) return null;
  const dist = distanceAt(ep, t);
  // The ball stands on the surface facing us, so it sits a little nearer the camera than the globe's centre.
  const ballR = stop.ballKm ? screenRadius(dist, height) * (stop.ballKm / 2 / ep.body.radiusKm) * (dist / (dist - 1)) : 0;
  const lift = ballR;
  const w = stop.label.length * 21 + 60;
  const lx = Math.max(56, Math.min(width - SAFE_RIGHT - w, p.x - w / 2));
  const ly = Math.max(470, p.y - 170 - lift);
  const pulse = 1 + 0.5 * ((t * 1.3) % 1);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      <svg width={width} height={height} style={{ position: "absolute" }}>
        {stop.ballKm ? (
          <circle cx={p.x} cy={p.y} r={ballR + 10} fill="none" stroke={PAL.white} strokeWidth={5} strokeDasharray="14 10" />
        ) : (
          <>
            <circle cx={p.x} cy={p.y} r={26 * pulse} fill="none" stroke={PAL.gold} strokeWidth={4} opacity={1.5 - pulse} />
            <circle cx={p.x} cy={p.y} r={13} fill={PAL.gold} stroke={PAL.ink} strokeWidth={4} />
          </>
        )}
        <line x1={p.x} y1={p.y - (ballR ? ballR + 14 : 0)} x2={Math.max(lx + 30, Math.min(lx + w - 30, p.x))} y2={ly + 30} stroke={PAL.white} strokeWidth={5} strokeLinecap="round" />
      </svg>
      <div
        style={{
          position: "absolute",
          left: lx,
          top: ly,
          width: w,
          boxSizing: "border-box",
          textAlign: "center",
          transform: `translateY(-50%) scale(${appear})`,
          transformOrigin: "center bottom",
          padding: "12px 26px",
          borderRadius: 999,
          background: PAL.card,
          border: `3px solid ${PAL.gold}`,
          fontSize: 38,
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        {stop.label}
      </div>
    </div>
  );
};

export const Orbit: React.FC<OrbitEpisode> = (props) => {
  // Props from --props aren't run through the schema, so fill in its defaults here.
  const ep = useMemo(() => orbitSchema.parse(props), [props]);
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  // During the cold open the picture flashes forward; everything visual uses vt, captions and audio use t.
  const vt = visualTime(ep, t);
  const dist = distanceAt(ep, vt);
  const r = screenRadius(dist, height);
  const lastTo = ep.narration[ep.narration.length - 1].to;
  const lineIdx = t >= lastTo ? ep.narration.length - 1 : Math.max(0, ep.narration.findIndex((n) => t < n.to));
  const stop = stopFor(ep, lineIdx);
  const vLineIdx = vt >= lastTo ? ep.narration.length - 1 : Math.max(0, ep.narration.findIndex((n) => vt < n.to));

  const cut = coldOpenLength(ep);
  const cardIn =
    interpolate(t, [cut + 0.2, cut + 0.8], [0, 1], { ...clamp, easing: ease }) * (1 - skitIn(ep, t)) * (1 - bannerIn(ep, t)) * (t < cut ? 0 : 1);
  const valueKey = stop?.value ?? ep.body.name;
  const valueIn = spring({ frame: Math.round((t - (stop ? ep.narration[stop.line].from + 0.6 : 0.2)) * fps), fps, config: { damping: 14 } });

  return (
    <AbsoluteFill style={{ fontFamily: UI_FONT, color: PAL.white, backgroundColor: "#120B33" }}>
      <div style={{ position: "absolute", inset: 0, ...cameraStyle(ep, t) }}>
      <Space ep={ep} t={vt} dist={dist} />
      {ep.body.glow ? <Glow colour={ep.body.glow} r={r} /> : null}

      <div style={{ position: "absolute", left: 0, top: -LIFT, width, height }}>
        <ThreeCanvas width={width} height={height} gl={{ alpha: true, antialias: true }} camera={{ fov: FOV, position: [0, 0, dist], near: 0.1, far: 100 }}>
          <CameraRig dist={dist} />
          <ambientLight intensity={0.35} color="#7B6BE0" />
          <directionalLight position={[-5, 2.5, 3]} intensity={2.7} color="#FFF3DC" />
          <directionalLight position={[5, 1, -3]} intensity={1.2} color="#7FD8FF" />
          <World ep={ep} t={vt} />
          {ep.body.moon ? <SmallMoon t={vt} /> : null}
        </ThreeCanvas>
      </div>

      <Pin ep={ep} t={vt} lineIdx={vLineIdx} />
      </div>

      {/* Stat card: the current stop's number, or the world's name */}
      <div style={{ position: "absolute", left: 56, top: 130, opacity: cardIn, transform: `translateY(${(1 - cardIn) * -30}px)` }}>
        <div style={{ display: "inline-block", padding: "18px 34px 22px", borderRadius: 26, background: PAL.card, border: `3px solid ${PAL.gold}` }}>
          <div style={{ fontSize: 30, fontWeight: 500, color: PAL.gold, letterSpacing: "0.08em" }}>
            {(stop?.caption ?? ep.body.name).toUpperCase()}
          </div>
          <div key={valueKey} style={{ fontSize: 112, fontWeight: 700, lineHeight: 1, transform: `scale(${0.85 + 0.15 * Math.min(1, valueIn)})`, transformOrigin: "left bottom" }}>
            {stop?.value ?? ep.body.name}
          </div>
        </div>
      </div>

      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 60%, rgba(8,2,30,0.5) 100%)", pointerEvents: "none" }} />

      <Beats ep={ep} t={t} font={UI_FONT} />
      <PopCaptions ep={ep} t={t} font={UI_FONT} bottom={SAFE_BOTTOM} />
      <HookLayer ep={ep} t={t} font={UI_FONT} />


      <Skit ep={ep} font={UI_FONT} />
      {ep.music ? <Audio src={staticFile(ep.music)} volume={(f) => musicVolume(ep, f / fps)} /> : null}
      {ep.voiceover ? <Audio src={staticFile(ep.voiceover)} volume={VOICE_VOLUME} /> : null}
    </AbsoluteFill>
  );
};

/** Keeps the R3F camera at this frame's distance (the camera prop only applies on mount). */
const CameraRig: React.FC<{ dist: number }> = ({ dist }) => {
  const camera = useThree((s) => s.camera);
  // Set during render so it is in place before ThreeCanvas draws this frame.
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return null;
};
