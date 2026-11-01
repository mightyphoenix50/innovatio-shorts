import type { PropKind } from "./types";

/** Story props, drawn centred on (0, 0) about 130 units across, in the same flat style as the hero. */
export const PropArt: React.FC<{ kind: PropKind; t: number; uv?: number }> = ({ kind, t, uv = 0 }) => {
  switch (kind) {
    case "ball":
      return (
        <g transform={`rotate(${t * 140})`}>
          <circle r={56} fill="#F4F4F6" />
          <polygon points="0,-20 19,-6 12,16 -12,16 -19,-6" fill="#23233F" />
          {[0, 72, 144, 216, 288].map((a) => (
            <path key={a} d="M 0 -20 L 0 -54" stroke="#23233F" strokeWidth={6} transform={`rotate(${a})`} />
          ))}
        </g>
      );
    case "phone":
      return (
        <g transform="rotate(-12)">
          <rect x={-34} y={-62} width={68} height={124} rx={14} fill="#23233F" />
          <rect x={-27} y={-52} width={54} height={98} rx={6} fill="#48CAE4" />
          <rect x={-18} y={-40} width={36} height={8} rx={4} fill="#F4F4F6" opacity={0.7} />
        </g>
      );
    case "cup":
      return (
        <g>
          <path d="M -40 -40 L 40 -40 L 32 44 Q 0 54 -32 44 Z" fill="#F4F4F6" />
          <path d="M 40 -22 Q 70 -18 64 8 Q 58 26 36 22" stroke="#F4F4F6" strokeWidth={10} fill="none" />
          <ellipse cx={0} cy={-40} rx={40} ry={10} fill="#6B4226" />
          {[-14, 6, 24].map((x, k) => (
            <path key={k} d={`M ${x} -58 q 8 -14 0 -28`} stroke="#F4F4F6" strokeWidth={5} fill="none" opacity={0.6 + 0.4 * Math.sin(t * 4 + k)} />
          ))}
        </g>
      );
    case "clock":
      return (
        <g>
          <circle r={60} fill="#F4F4F6" stroke="#E9C46A" strokeWidth={10} />
          {Array.from({ length: 12 }, (_, k) => (
            <rect key={k} x={-3} y={-50} width={6} height={10} fill="#23233F" transform={`rotate(${k * 30})`} />
          ))}
          <rect x={-4} y={-38} width={8} height={40} rx={4} fill="#23233F" transform={`rotate(${t * 30})`} />
          <rect x={-3} y={-48} width={6} height={50} rx={3} fill="#E63946" transform={`rotate(${t * 360})`} />
          <circle r={7} fill="#23233F" />
        </g>
      );
    case "car":
      return (
        <g>
          <path d="M -90 10 L -80 -20 L -40 -24 L -20 -50 L 40 -50 L 64 -22 L 92 -14 L 96 18 L -90 18 Z" fill="#E76F51" />
          <path d="M -12 -44 L 34 -44 L 52 -24 L -28 -24 Z" fill="#9EE6D8" />
          {[-52, 58].map((x) => (
            <g key={x} transform={`translate(${x} 22) rotate(${t * 400})`}>
              <circle r={22} fill="#23233F" />
              <rect x={-3} y={-18} width={6} height={36} fill="#9BB4D6" />
            </g>
          ))}
          <circle cx={88} cy={-4} r={8} fill="#FFE6B8" />
        </g>
      );
    case "bulb":
      return (
        <g>
          <circle cx={0} cy={-14} r={48} fill="#FFE6B8" />
          <circle cx={0} cy={-14} r={74} fill="#FFE6B8" opacity={0.25 + 0.15 * Math.sin(t * 5)} />
          <rect x={-22} y={30} width={44} height={30} rx={6} fill="#9BB4D6" />
        </g>
      );
    case "trophy":
      return (
        <g>
          <path d="M -46 -54 L 46 -54 Q 44 10 0 22 Q -44 10 -46 -54 Z" fill="#E9C46A" />
          <path d="M -46 -44 Q -76 -40 -64 -10 Q -56 4 -36 0 M 46 -44 Q 76 -40 64 -10 Q 56 4 36 0" stroke="#E9C46A" strokeWidth={10} fill="none" />
          <rect x={-8} y={20} width={16} height={24} fill="#C9A24A" />
          <rect x={-34} y={44} width={68} height={16} rx={4} fill="#C9A24A" />
        </g>
      );
    case "book":
      return (
        <g transform="rotate(-8)">
          <rect x={-58} y={-44} width={116} height={88} rx={6} fill="#2A9D8F" />
          <rect x={-50} y={-36} width={100} height={70} rx={4} fill="#F4F4F6" />
          <line x1={0} y1={-36} x2={0} y2={34} stroke="#2A9D8F" strokeWidth={6} />
        </g>
      );
    case "flower":
      return (
        <g>
          {Array.from({ length: 6 }, (_, k) => (
            <ellipse key={k} cx={0} cy={-30} rx={18} ry={32} fill="#F2D63A" transform={`rotate(${k * 60})`} />
          ))}
          {uv > 0
            ? Array.from({ length: 6 }, (_, k) => (
                <ellipse key={`u${k}`} cx={0} cy={-20} rx={9} ry={20} fill="#3B0F80" opacity={0.85 * uv} transform={`rotate(${k * 60})`} />
              ))
            : null}
          <circle r={uv > 0 ? 20 : 16} fill={uv > 0 ? "#2A0A66" : "#F2B134"} />
        </g>
      );
    case "bee":
      return (
        <g>
          {[-1, 1].map((s) => (
            <ellipse key={s} cx={s * 12} cy={-34} rx={22} ry={30} fill="#E8F4FF" opacity={0.75} transform={`rotate(${s * (20 + 25 * Math.sin(t * 60))} ${s * 4} -14)`} />
          ))}
          <ellipse cx={0} cy={0} rx={54} ry={36} fill="#F2C230" />
          {[-16, 8].map((x) => (
            <rect key={x} x={x} y={-34} width={14} height={68} fill="#23233F" />
          ))}
          <circle cx={46} cy={-6} r={18} fill="#23233F" />
          <circle cx={52} cy={-10} r={5} fill="#F4F4F6" />
        </g>
      );
    case "eye":
      return (
        <g>
          <path d="M -70 0 Q 0 -60 70 0 Q 0 60 -70 0 Z" fill="#F4F4F6" />
          <circle r={30} fill={uv > 0 ? "#B57BFF" : "#2A9D8F"} />
          <circle r={14} fill="#23233F" />
          <circle cx={8} cy={-8} r={5} fill="#F4F4F6" />
        </g>
      );
    case "brain":
      return (
        <g>
          <path d="M -60 10 Q -70 -40 -30 -52 Q 0 -70 30 -52 Q 70 -40 60 10 Q 56 44 20 46 Q 0 56 -20 46 Q -56 44 -60 10 Z" fill="#F2A0B5" />
          <path d="M 0 -56 L 0 46 M -40 -20 Q -20 -10 -38 10 M 40 -20 Q 20 -10 38 10" stroke="#C96F8A" strokeWidth={6} fill="none" />
          <circle r={80} fill="#E9C46A" opacity={0.15 + 0.1 * Math.sin(t * 8)} />
        </g>
      );
    case "rocket":
      return (
        <g transform="rotate(30)">
          <path d="M 0 -70 C 26 -40 28 0 22 40 L -22 40 C -28 0 -26 -40 0 -70 Z" fill="#F4F4F6" />
          <circle cx={0} cy={-18} r={12} fill="#48CAE4" />
          <path d="M -22 40 L -40 64 L -20 54 Z M 22 40 L 40 64 L 20 54 Z" fill="#E63946" />
          <path d={`M -12 44 L 0 ${74 + 14 * Math.sin(t * 30)} L 12 44 Z`} fill="#F09A3E" />
        </g>
      );
    case "coin":
    default:
      return (
        <g transform={`scale(${Math.cos(t * 6)} 1)`}>
          <circle r={50} fill="#E9C46A" stroke="#C9A24A" strokeWidth={8} />
          <text x={0} y={18} textAnchor="middle" fontSize={54} fontWeight={800} fill="#C9A24A">
            $
          </text>
        </g>
      );
  }
};
