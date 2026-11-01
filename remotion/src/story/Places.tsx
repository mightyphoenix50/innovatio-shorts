import { random } from "remotion";
import type { Place } from "./types";

/**
 * The painted places a Story scene can be set in, drawn in SVG at 1080×1920 with the ground at GROUND.
 * Everything comes from the seed, so a scene always looks the same. `drift` is a slow sideways parallax
 * offset in px; `uv` reveals the ultraviolet patterns on the meadow's flowers.
 */
export const GROUND = 1110;
const W = 1080;
const H = 1920;

const Sky: React.FC<{ id: string; stops: string[] }> = ({ id, stops }) => (
  <>
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        {stops.map((c, i) => (
          <stop key={i} offset={i / (stops.length - 1)} stopColor={c} />
        ))}
      </linearGradient>
    </defs>
    <rect x={-200} y={0} width={W + 400} height={H} fill={`url(#${id})`} />
  </>
);

const Glow: React.FC<{ id: string; cx: number; cy: number; r: number; colour: string; o?: number }> = ({ id, cx, cy, r, colour, o = 0.8 }) => (
  <>
    <defs>
      <radialGradient id={id}>
        <stop offset="0" stopColor={colour} stopOpacity={o} />
        <stop offset="1" stopColor={colour} stopOpacity={0} />
      </radialGradient>
    </defs>
    <circle cx={cx} cy={cy} r={r} fill={`url(#${id})`} />
  </>
);

const Skyline: React.FC<{ seed: string; base: number; colour: string; windows: string; minH: number; maxH: number; drift: number }> = ({
  seed,
  base,
  colour,
  windows,
  minH,
  maxH,
  drift,
}) => {
  const out: React.ReactNode[] = [];
  let x = -220;
  let i = 0;
  while (x < W + 220) {
    const w = 70 + 90 * random(`${seed}-w${i}`);
    const h = minH + (maxH - minH) * random(`${seed}-h${i}`);
    out.push(<rect key={`b${i}`} x={x + drift} y={base - h} width={w - 6} height={h + 20} fill={colour} />);
    if (random(`${seed}-spire${i}`) > 0.82) out.push(<rect key={`s${i}`} x={x + drift + w / 2 - 4} y={base - h - 60} width={8} height={60} fill={colour} />);
    for (let r = 0; r < Math.floor(h / 46); r++) {
      for (let c = 0; c < Math.floor((w - 18) / 26); c++) {
        if (random(`${seed}-win${i}-${r}-${c}`) > 0.72) {
          out.push(<rect key={`w${i}-${r}-${c}`} x={x + drift + 10 + c * 26} y={base - h + 16 + r * 46} width={12} height={18} fill={windows} opacity={0.75} />);
        }
      }
    }
    x += w;
    i++;
  }
  return <g>{out}</g>;
};

const Stars: React.FC<{ seed: string; n: number; maxY: number; t: number }> = ({ seed, n, maxY, t }) => (
  <g>
    {Array.from({ length: n }, (_, i) => {
      const tw = 0.5 + 0.5 * Math.sin(t * (1 + 2 * random(`${seed}-st${i}`)) + i);
      return <circle key={i} cx={random(`${seed}-sx${i}`) * W} cy={random(`${seed}-sy${i}`) * maxY} r={1.5 + 2.5 * random(`${seed}-sr${i}`)} fill="#FFFFFF" opacity={0.3 + 0.6 * tw} />;
    })}
  </g>
);

/** A flower; with `uv` its petals show the bullseye nectar guide that only ultraviolet-seeing eyes pick out. */
export const Flower: React.FC<{ x: number; y: number; s: number; colour: string; uv: number; sway: number }> = ({ x, y, s, colour, uv, sway }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d={`M 0 0 Q ${8 + sway} -60 ${sway * 2} -120`} stroke="#3F7D4E" strokeWidth={8} fill="none" />
    <g transform={`translate(${sway * 2} -120)`}>
      {Array.from({ length: 6 }, (_, k) => (
        <ellipse key={k} cx={0} cy={-30} rx={18} ry={32} fill={colour} transform={`rotate(${k * 60})`} />
      ))}
      {uv > 0
        ? Array.from({ length: 6 }, (_, k) => (
            <ellipse key={`u${k}`} cx={0} cy={-20} rx={9} ry={20} fill="#3B0F80" opacity={0.85 * uv} transform={`rotate(${k * 60})`} />
          ))
        : null}
      <circle cx={0} cy={0} r={uv > 0 ? 18 + 6 * uv : 16} fill={uv > 0 ? "#2A0A66" : "#F2B134"} />
    </g>
  </g>
);

export const PlaceArt: React.FC<{ place: Place; seed: string; t: number; drift: number; uv: number }> = ({ place, seed, t, drift, uv }) => {
  const s = `${seed}-${place}`;
  switch (place) {
    case "city":
      return (
        <g>
          <Sky id={`${s}-sky`} stops={["#2B2D5B", "#7A4E7E", "#E29578", "#F4C89A"]} />
          <Glow id={`${s}-sun`} cx={720 + drift * 0.2} cy={980} r={420} colour="#FFD9A0" />
          <circle cx={720 + drift * 0.2} cy={980} r={70} fill="#FFE6B8" opacity={0.9} />
          <Skyline seed={`${s}-far`} base={1120} colour="#8B5E7F" windows="#FFD9A0" minH={180} maxH={420} drift={drift * 0.3} />
          <Skyline seed={`${s}-near`} base={GROUND - 10} colour="#3A2F4F" windows="#FFC98A" minH={120} maxH={330} drift={drift * 0.6} />
          <rect x={-200} y={GROUND - 20} width={W + 400} height={H} fill="#2A2238" />
          <rect x={-200} y={GROUND - 20} width={W + 400} height={8} fill="#5C4D7D" />
        </g>
      );
    case "room":
      return (
        <g>
          <rect x={-200} y={0} width={W + 400} height={H} fill="#4A3B52" />
          <g transform={`translate(${drift * 0.4} 0)`}>
            <rect x={600} y={460} width={360} height={460} rx={10} fill="#E29578" />
            <rect x={600} y={460} width={360} height={460} rx={10} fill="none" stroke="#2E2433" strokeWidth={22} />
            <line x1={780} y1={460} x2={780} y2={920} stroke="#2E2433" strokeWidth={14} />
            <line x1={600} y1={690} x2={960} y2={690} stroke="#2E2433" strokeWidth={14} />
            <Skyline seed={`${s}-view`} base={920} colour="#7A4E7E" windows="#FFD9A0" minH={60} maxH={180} drift={0} />
            <rect x={110} y={560} width={300} height={22} fill="#6B5466" />
            {[0, 1, 2, 3, 4].map((k) => (
              <rect key={k} x={124 + k * 52} y={470 + (k % 2) * 16} width={38} height={90 - (k % 2) * 16} fill={["#E9C46A", "#2A9D8F", "#E76F51", "#9BB4D6", "#F4F4F6"][k]} />
            ))}
          </g>
          <Glow id={`${s}-lamp`} cx={180} cy={760} r={380} colour="#FFD9A0" o={0.45} />
          <rect x={-200} y={GROUND - 20} width={W + 400} height={H} fill="#2E2433" />
          <rect x={-200} y={GROUND - 20} width={W + 400} height={10} fill="#6B5466" />
        </g>
      );
    case "street":
      return (
        <g>
          <Sky id={`${s}-sky`} stops={["#141B33", "#1E2A47", "#3E4E7A"]} />
          <Stars seed={s} n={30} maxY={600} t={t} />
          <Skyline seed={`${s}-far`} base={GROUND - 120} colour="#26304F" windows="#FFC98A" minH={200} maxH={520} drift={drift * 0.4} />
          <g transform={`translate(${drift * 0.7} 0)`}>
            <rect x={140} y={GROUND - 520} width={14} height={520} fill="#1A1F33" />
            <rect x={110} y={GROUND - 540} width={74} height={30} rx={8} fill="#1A1F33" />
            <Glow id={`${s}-lamp`} cx={147} cy={GROUND - 500} r={260} colour="#FFD9A0" o={0.55} />
            <rect x={900} y={GROUND - 440} width={16} height={440} fill="#1A1F33" />
            <rect x={872} y={GROUND - 600} width={72} height={170} rx={14} fill="#1A1F33" />
            {["#E63946", "#E9C46A", "#3ED598"].map((c, k) => (
              <circle key={k} cx={908} cy={GROUND - 570 + k * 52} r={18} fill={c} opacity={k === 0 ? 1 : 0.25} />
            ))}
          </g>
          <rect x={-200} y={GROUND - 30} width={W + 400} height={H} fill="#1B2033" />
          {Array.from({ length: 8 }, (_, k) => (
            <rect key={k} x={-180 + k * 190 + ((drift * 0.9) % 190)} y={GROUND + 130} width={110} height={14} fill="#E9C46A" opacity={0.7} />
          ))}
        </g>
      );
    case "stadium":
      return (
        <g>
          <Sky id={`${s}-sky`} stops={["#070B1E", "#0E1530", "#1A2650"]} />
          {[160, 920].map((x, k) => (
            <g key={k}>
              <polygon points={`${x - 40},230 ${x + 40},230 ${x + 260 * (k ? -1 : 1)},${GROUND} ${x - 160 * (k ? -1 : 1)},${GROUND}`} fill="#DDE8FF" opacity={0.07} />
              <rect x={x - 50} y={200} width={100} height={40} rx={6} fill="#F4F4F6" />
              <Glow id={`${s}-fl${k}`} cx={x} cy={220} r={180} colour="#E8F4FF" o={0.7} />
            </g>
          ))}
          <g transform={`translate(${drift * 0.4} 0)`}>
            <rect x={-200} y={760} width={W + 400} height={GROUND - 760} fill="#1F2A4D" />
            {Array.from({ length: 220 }, (_, i) => (
              <circle
                key={i}
                cx={-180 + random(`${s}-cx${i}`) * (W + 360)}
                cy={790 + random(`${s}-cy${i}`) * (GROUND - 900)}
                r={9}
                fill={["#9BB4D6", "#E9C46A", "#E76F51", "#F4F4F6"][i % 4]}
                opacity={0.35}
              />
            ))}
          </g>
          <rect x={-200} y={GROUND - 120} width={W + 400} height={H} fill="#2F6B4F" />
          {Array.from({ length: 7 }, (_, k) => (
            <rect key={k} x={-200 + k * 220} y={GROUND - 120} width={110} height={H} fill="#357A5A" />
          ))}
          <rect x={-200} y={GROUND - 124} width={W + 400} height={8} fill="#F4F4F6" opacity={0.7} />
        </g>
      );
    case "lab":
      return (
        <g>
          <Sky id={`${s}-sky`} stops={["#0F2A30", "#13343B", "#1F5F6B"]} />
          <g transform={`translate(${drift * 0.4} 0)`}>
            {Array.from({ length: 5 }, (_, k) => (
              <rect key={k} x={60 + k * 210} y={300} width={150} height={360} rx={12} fill="#173F47" stroke="#2C6E78" strokeWidth={6} />
            ))}
            <rect x={-200} y={880} width={W + 400} height={40} fill="#2C6E78" />
            {[120, 330, 760, 930].map((x, k) => (
              <g key={k}>
                <path d={`M ${x - 18} 760 L ${x - 18} 820 L ${x - 50} 880 L ${x + 50} 880 L ${x + 18} 820 L ${x + 18} 760 Z`} fill="#9EE6D8" opacity={0.35} />
                <path d={`M ${x - 38} 860 L ${x + 38} 860 L ${x + 50} 880 L ${x - 50} 880 Z`} fill={["#3ED598", "#B57BFF", "#48CAE4", "#E9C46A"][k]} />
                <Glow id={`${s}-fl${k}`} cx={x} cy={860} r={110} colour={["#3ED598", "#B57BFF", "#48CAE4", "#E9C46A"][k]} o={0.45} />
              </g>
            ))}
          </g>
          <rect x={-200} y={GROUND - 20} width={W + 400} height={H} fill="#0C2328" />
          <rect x={-200} y={GROUND - 20} width={W + 400} height={8} fill="#2C6E78" />
        </g>
      );
    case "night":
      return (
        <g>
          <Sky id={`${s}-sky`} stops={["#06051A", "#0B0A24", "#2A1E5C"]} />
          <Stars seed={s} n={140} maxY={1100} t={t} />
          <circle cx={820 + drift * 0.15} cy={360} r={60} fill="#F4F1DE" />
          <Glow id={`${s}-moon`} cx={820 + drift * 0.15} cy={360} r={220} colour="#F4F1DE" o={0.3} />
          <path d={`M -200 ${GROUND - 120} Q ${300 + drift * 0.3} ${GROUND - 330} ${700 + drift * 0.3} ${GROUND - 160} T ${W + 200} ${GROUND - 200} V ${H} H -200 Z`} fill="#1B1640" />
          <rect x={-200} y={GROUND - 20} width={W + 400} height={H} fill="#140F30" />
        </g>
      );
    case "meadow":
    default:
      return (
        <g>
          <Sky id={`${s}-sky`} stops={["#7FB8E0", "#B9DDF0", "#F6E3B4"]} />
          <circle cx={200 + drift * 0.15} cy={330} r={80} fill="#FFF1B8" />
          <Glow id={`${s}-sun`} cx={200 + drift * 0.15} cy={330} r={300} colour="#FFF1B8" o={0.6} />
          <path d={`M -200 ${GROUND - 200} Q ${260 + drift * 0.3} ${GROUND - 420} ${640 + drift * 0.3} ${GROUND - 230} T ${W + 200} ${GROUND - 260} V ${H} H -200 Z`} fill="#8CC07A" />
          <path d={`M -200 ${GROUND - 60} Q ${400 + drift * 0.5} ${GROUND - 200} ${W + 200} ${GROUND - 80} V ${H} H -200 Z`} fill="#6BAA5E" />
          <rect x={-200} y={GROUND - 20} width={W + 400} height={H} fill="#5A9A4F" />
          {Array.from({ length: 9 }, (_, i) => (
            <Flower
              key={i}
              x={-60 + i * 150 + drift * 0.7 + 40 * random(`${s}-fx${i}`)}
              y={GROUND + 40 + 120 * random(`${s}-fy${i}`)}
              s={0.8 + 0.5 * random(`${s}-fs${i}`)}
              colour={["#F2D63A", "#F4F4F6", "#F2D63A", "#E9A6C9"][i % 4]}
              uv={uv}
              sway={6 * Math.sin(t * 1.6 + i)}
            />
          ))}
        </g>
      );
  }
};
