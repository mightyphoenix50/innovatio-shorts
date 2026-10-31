import type { Mood, Pose } from "./types";

/**
 * The channel's story hero, original to Innovatio: a round indigo head with big round eyes and a hair tuft,
 * in a hoodie. Drawn in SVG with feet at (0, 0), about 560 units tall. Arms are two segments; each pose sets
 * the shoulder and elbow angles (0 = hanging down, 90 = straight out to the side, 180 = straight up).
 */
export const INK = "#23233F";
const RIM = "#9CC8FF";
const EYE = "#FFFFFF";
const GOLD = "#E9C46A";

type Arm = { s: number; e: number };
export type PoseShape = { l: Arm; r: Arm; lean: number; lift: number; headTilt: number; stride: number };

const POSES: Record<Pose, PoseShape> = {
  idle: { l: { s: 12, e: 8 }, r: { s: 12, e: 8 }, lean: 0, lift: 0, headTilt: 0, stride: 0 },
  catch: { l: { s: 18, e: 10 }, r: { s: 150, e: 18 }, lean: 4, lift: 0, headTilt: -6, stride: 0.3 },
  point: { l: { s: 14, e: 8 }, r: { s: 92, e: 0 }, lean: 3, lift: 0, headTilt: 0, stride: 0.2 },
  cheer: { l: { s: 158, e: 12 }, r: { s: 158, e: 12 }, lean: 0, lift: 1, headTilt: -8, stride: 0.2 },
  shrug: { l: { s: 38, e: 78 }, r: { s: 38, e: 78 }, lean: 0, lift: 0, headTilt: 8, stride: 0 },
  think: { l: { s: 14, e: 8 }, r: { s: 28, e: -158 }, lean: -2, lift: 0, headTilt: 6, stride: 0 },
  run: { l: { s: 30, e: -80 }, r: { s: 30, e: -80 }, lean: 12, lift: 0, headTilt: -4, stride: 1 },
  slump: { l: { s: 4, e: 2 }, r: { s: 4, e: 2 }, lean: -4, lift: 0, headTilt: 18, stride: 0 },
};

const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const mixArm = (a: Arm, b: Arm, k: number): Arm => ({ s: mix(a.s, b.s, k), e: mix(a.e, b.e, k) });

/** The pose at a moment: blends from the previous scene's pose to this one over the first 0.4 s. */
export const blendPose = (from: Pose, to: Pose, k: number): PoseShape => {
  const a = POSES[from];
  const b = POSES[to];
  return {
    l: mixArm(a.l, b.l, k),
    r: mixArm(a.r, b.r, k),
    lean: mix(a.lean, b.lean, k),
    lift: mix(a.lift, b.lift, k),
    headTilt: mix(a.headTilt, b.headTilt, k),
    stride: mix(a.stride, b.stride, k),
  };
};

const rad = (d: number) => (d * Math.PI) / 180;
/** Hand position for an arm from its shoulder; side is -1 (left) or 1 (right). */
const armPoints = (sx: number, sy: number, arm: Arm, side: number) => {
  const u = 92;
  const f = 86;
  const ex = sx + side * Math.sin(rad(arm.s)) * u;
  const ey = sy + Math.cos(rad(arm.s)) * u;
  const fa = arm.s + arm.e;
  const hx = ex + side * Math.sin(rad(fa)) * f;
  const hy = ey + Math.cos(rad(fa)) * f;
  return { ex, ey, hx, hy };
};

/** Where the right hand is, in the hero's own units (for props held or caught). */
export const handAt = (p: PoseShape, t: number) => {
  const run = runSwing(p, t);
  const bodyY = -bounceOf(p, t);
  return armPoints(58, -352 + bodyY, { s: p.r.s + run, e: p.r.e }, 1);
};

const runSwing = (p: PoseShape, t: number) => p.stride * 32 * Math.sin(t * 11);
const bounceOf = (p: PoseShape, t: number) => p.lift * 46 * Math.abs(Math.sin(t * 6)) + p.stride * 10 * Math.abs(Math.sin(t * 11));

const Face: React.FC<{ mood: Mood; blink: boolean; glow: number; uv: number }> = ({ mood, blink, glow, uv }) => {
  const shocked = mood === "shocked";
  const eyeR = shocked ? 30 : 26;
  const pupil = shocked ? 8 : 12;
  const lid = blink ? 1 : mood === "smug" ? 0.5 : mood === "sad" ? 0.3 : 0;
  const iris = uv > 0 ? "#B57BFF" : glow > 0 ? GOLD : INK;
  const eye = (cx: number) => (
    <g key={cx}>
      {mood === "happy" && !blink ? (
        <path d={`M ${cx - 24} 6 Q ${cx} -26 ${cx + 24} 6`} stroke={EYE} strokeWidth={11} fill="none" strokeLinecap="round" />
      ) : (
        <>
          <ellipse cx={cx} cy={0} rx={eyeR * 0.86} ry={eyeR} fill={EYE} />
          <circle cx={cx + 4} cy={4} r={pupil} fill={iris} />
          <circle cx={cx + 8} cy={-2} r={4} fill={EYE} />
          {lid > 0 ? <rect x={cx - eyeR} y={-eyeR - 2} width={eyeR * 2} height={(eyeR * 2 + 4) * lid} fill={INK} /> : null}
        </>
      )}
    </g>
  );
  const brow = (cx: number, side: number) => {
    if (mood === "determined") return <line x1={cx - 22 * side} y1={-46} x2={cx + 20 * side} y2={-34} stroke={EYE} strokeWidth={8} strokeLinecap="round" />;
    if (mood === "sad") return <line x1={cx - 20 * side} y1={-34} x2={cx + 20 * side} y2={-46} stroke={EYE} strokeWidth={7} strokeLinecap="round" />;
    if (shocked) return <path d={`M ${cx - 20} -52 Q ${cx} -64 ${cx + 20} -52`} stroke={EYE} strokeWidth={7} fill="none" strokeLinecap="round" />;
    return null;
  };
  const mouth =
    mood === "shocked" ? (
      <ellipse cx={8} cy={56} rx={15} ry={20} fill={EYE} />
    ) : mood === "happy" ? (
      <path d="M -22 44 Q 8 78 38 44 Z" fill={EYE} />
    ) : mood === "smug" ? (
      <path d="M -14 54 Q 14 62 36 42" stroke={EYE} strokeWidth={8} fill="none" strokeLinecap="round" />
    ) : mood === "sad" ? (
      <path d="M -16 62 Q 8 46 32 62" stroke={EYE} strokeWidth={8} fill="none" strokeLinecap="round" />
    ) : mood === "determined" ? (
      <line x1={-12} y1={54} x2={30} y2={52} stroke={EYE} strokeWidth={8} strokeLinecap="round" />
    ) : (
      <path d="M -10 52 Q 10 60 30 52" stroke={EYE} strokeWidth={8} fill="none" strokeLinecap="round" />
    );
  return (
    <g>
      {eye(-30)}
      {eye(40)}
      {brow(-30, -1)}
      {brow(40, 1)}
      {mouth}
    </g>
  );
};

/** A full figure. `extra` draws a simpler, muted background person (no rim light, no face detail). */
export const Figure: React.FC<{
  pose: PoseShape;
  mood: Mood;
  hoodie: string;
  t: number;
  blink?: boolean;
  glow?: number;
  uv?: number;
  extra?: boolean;
  frozen?: boolean;
}> = ({ pose, mood, hoodie, t, blink = false, glow = 0, uv = 0, extra = false, frozen = false }) => {
  const tt = frozen ? 0.6 : t;
  const run = runSwing(pose, tt);
  const bob = frozen ? 0 : Math.sin(tt * 2.6) * 4;
  const bodyY = -bounceOf(pose, tt) + bob;
  const shoulderY = -352 + bodyY;
  const L = armPoints(-58, shoulderY, { s: pose.l.s - run, e: pose.l.e }, -1);
  const R = armPoints(58, shoulderY, { s: pose.r.s + run, e: pose.r.e }, 1);
  const legSwing = pose.stride * 26 * Math.sin(tt * 11);
  const hipY = -196 + bodyY * 0.4;
  const shade = "rgba(0,0,0,0.22)";
  const sleeve = 34;
  return (
    <g transform={`rotate(${pose.lean} 0 -200)`}>
      {/* legs */}
      {[-1, 1].map((side) => {
        const sw = side * legSwing;
        const fx = side * 34 + sw * 2.2;
        const kneeX = side * 30 + sw * 1.4;
        return (
          <g key={side}>
            <path d={`M ${side * 30} ${hipY} Q ${kneeX} -100 ${fx} -14`} stroke={INK} strokeWidth={26} fill="none" strokeLinecap="round" />
            <ellipse cx={fx + side * 10} cy={-8} rx={30} ry={14} fill={extra ? INK : "#F4F4F6"} />
          </g>
        );
      })}
      {/* back arm */}
      <path d={`M -58 ${shoulderY} L ${L.ex} ${L.ey} L ${L.hx} ${L.hy}`} stroke={hoodie} strokeWidth={sleeve} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M -58 ${shoulderY} L ${L.ex} ${L.ey} L ${L.hx} ${L.hy}`} stroke={shade} strokeWidth={sleeve} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={L.hx} cy={L.hy} r={17} fill={INK} />
      {/* body */}
      <path
        d={`M -78 ${shoulderY - 12} Q 0 ${shoulderY - 34} 78 ${shoulderY - 12} L 70 ${hipY + 8} Q 0 ${hipY + 22} -70 ${hipY + 8} Z`}
        fill={hoodie}
      />
      <path d={`M 20 ${shoulderY - 20} Q 78 ${shoulderY - 12} 78 ${shoulderY - 12} L 70 ${hipY + 8} Q 40 ${hipY + 16} 20 ${hipY + 16} Z`} fill={shade} />
      <rect x={-46} y={hipY - 70} width={92} height={44} rx={18} fill={shade} opacity={0.6} />
      {!extra ? (
        <>
          <line x1={-16} y1={shoulderY - 6} x2={-20} y2={shoulderY + 70} stroke={GOLD} strokeWidth={6} strokeLinecap="round" />
          <line x1={16} y1={shoulderY - 6} x2={20} y2={shoulderY + 70} stroke={GOLD} strokeWidth={6} strokeLinecap="round" />
        </>
      ) : null}
      {/* head */}
      <g transform={`translate(0 ${-468 + bodyY}) rotate(${pose.headTilt})`}>
        {/* hood behind the head */}
        <path d="M -96 40 Q -110 -60 0 -104 Q 110 -60 96 40 Z" fill={hoodie} />
        <circle cx={0} cy={0} r={96} fill={INK} />
        {!extra ? <path d="M 60 -70 A 96 96 0 0 1 92 30" stroke={RIM} strokeWidth={8} fill="none" strokeLinecap="round" opacity={0.85} /> : null}
        {/* hair tuft */}
        <path d="M -10 -92 Q 6 -150 46 -136 Q 18 -124 18 -94 Z" fill={INK} />
        {extra ? (
          <>
            <circle cx={-26} cy={0} r={11} fill="rgba(255,255,255,0.75)" />
            <circle cx={34} cy={0} r={11} fill="rgba(255,255,255,0.75)" />
          </>
        ) : (
          <Face mood={mood} blink={blink} glow={glow} uv={uv} />
        )}
      </g>
      {/* front arm */}
      <path d={`M 58 ${shoulderY} L ${R.ex} ${R.ey} L ${R.hx} ${R.hy}`} stroke={hoodie} strokeWidth={sleeve} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={R.hx} cy={R.hy} r={17} fill={INK} />
    </g>
  );
};
