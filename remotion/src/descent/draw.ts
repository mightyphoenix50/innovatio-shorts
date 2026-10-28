import { random } from "remotion";
import type { CreatureKind, Episode } from "./types";

export const FONT_FAMILY = "Barlow Condensed";

type Ctx = CanvasRenderingContext2D;

const mix = (a: number, b: number, f: number) => a + (b - a) * f;
const TAU = Math.PI * 2;

/** Piecewise-linear lookup over [x, y] pairs, clamped at both ends. */
export const lerpTable = (table: [number, number][], x: number) => {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [a, va] = table[i];
    const [b, vb] = table[i + 1];
    if (x <= b) return mix(va, vb, (x - a) / (b - a || 1));
  }
  return table[table.length - 1][1];
};

const smooth = (f: number) => f * f * (3 - 2 * f);

/** Depth at time t, eased within each keyframe segment so the sub slows into each stop. */
export const depthAt = (ep: Episode, t: number) => {
  const k = ep.keyframes;
  if (t <= k[0][0]) return k[0][1];
  for (let i = 0; i < k.length - 1; i++) {
    const [a, da] = k[i];
    const [b, db] = k[i + 1];
    if (t <= b) return mix(da, db, smooth((t - a) / (b - a || 1)));
  }
  return k[k.length - 1][1];
};

const bgAt = (ep: Episode, d: number) => {
  const c = ep.colours;
  for (let i = 0; i < c.length - 1; i++) {
    const [a, ca] = c[i];
    const [b, cb] = c[i + 1];
    if (d <= b) {
      const f = Math.max(0, (d - a) / (b - a));
      return ca.map((v, j) => Math.round(mix(v, cb[j], f)));
    }
  }
  return c[c.length - 1][1];
};

const creature = (ctx: Ctx, kind: CreatureKind, x: number, y: number, t: number, s: number, salt: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const wob = (k: number) => Math.sin(t * k + salt);
  switch (kind) {
    case "fish": {
      ctx.fillStyle = "rgba(215,232,240,.85)";
      for (let i = 0; i < 6; i++) {
        const ox = (i % 3) * 22 - 22 + Math.sin(t * 2 + i) * 3;
        const oy = (i >> 1) * 14 - 14;
        ctx.beginPath();
        ctx.ellipse(ox, oy, 9, 3.5, 0, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(ox - 8, oy);
        ctx.lineTo(ox - 15, oy - 4);
        ctx.lineTo(ox - 15, oy + 4);
        ctx.fill();
      }
      break;
    }
    case "turtle": {
      ctx.fillStyle = "#4f8a55";
      ctx.beginPath();
      ctx.ellipse(0, 0, 20, 13, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#6fa86a";
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 8, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#4f8a55";
      ctx.beginPath();
      ctx.arc(24, -1, 5, 0, TAU);
      ctx.fill();
      const f = wob(2) * 0.4;
      ctx.beginPath();
      ctx.ellipse(6, -14, 12, 4, -0.5 + f, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(6, 14, 12, 4, 0.5 - f, 0, TAU);
      ctx.fill();
      break;
    }
    case "jelly": {
      const p = wob(2) * 3;
      ctx.fillStyle = "rgba(255,170,230,.55)";
      ctx.shadowColor = "#ff9fe4";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 15 + p, 0, Math.PI, 0);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,190,235,.6)";
      ctx.lineWidth = 1.4;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 6, 1);
        for (let j = 1; j <= 6; j++) ctx.lineTo(i * 6 + Math.sin(t * 2 + j + i) * 3, j * 7);
        ctx.stroke();
      }
      break;
    }
    case "lantern": {
      for (const [ox, oy] of [[0, 0], [-34, 14], [26, 22]]) {
        ctx.fillStyle = "#4d6b7d";
        ctx.beginPath();
        ctx.ellipse(ox, oy, 15, 5.5, 0, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(ox - 13, oy);
        ctx.lineTo(ox - 22, oy - 5);
        ctx.lineTo(ox - 22, oy + 5);
        ctx.fill();
        ctx.fillStyle = "#9ff0ff";
        ctx.shadowColor = "#7fe6ff";
        ctx.shadowBlur = 8;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.arc(ox - 8 + i * 4.5, oy + 3, 1.3, 0, TAU);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }
      break;
    }
    case "squid": {
      ctx.fillStyle = "rgba(215,85,100,.85)";
      ctx.beginPath();
      ctx.ellipse(0, -18, 10, 24, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 8, 9, 7, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(215,85,100,.8)";
      ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 3, 13);
        for (let j = 1; j <= 5; j++) ctx.lineTo(i * 4 + Math.sin(t * 3 + j + i) * 3, 13 + j * 6);
        ctx.stroke();
      }
      ctx.fillStyle = "#fff7c2";
      ctx.shadowColor = "#ffe98a";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(-4, 7, 2, 0, TAU);
      ctx.arc(4, 7, 2, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      break;
    }
    case "whale": {
      ctx.fillStyle = "#4a5963";
      ctx.beginPath();
      ctx.ellipse(0, 0, 86, 26, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(70, -2, 32, 24, 0, 0, TAU);
      ctx.fill();
      const f = Math.sin(t * 1.5) * 6;
      ctx.beginPath();
      ctx.moveTo(-78, 0);
      ctx.lineTo(-112, -20 + f);
      ctx.lineTo(-104, 0);
      ctx.lineTo(-112, 20 - f);
      ctx.fill();
      ctx.fillStyle = "#10161c";
      ctx.beginPath();
      ctx.arc(88, 6, 2.5, 0, TAU);
      ctx.fill();
      break;
    }
    case "angler": {
      ctx.fillStyle = "#1a232b";
      ctx.beginPath();
      ctx.ellipse(0, 0, 26, 19, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(26, 0);
      ctx.lineTo(40, -8);
      ctx.lineTo(40, 8);
      ctx.fill();
      ctx.strokeStyle = "#33424e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-14, -16);
      ctx.quadraticCurveTo(-20, -44, -36, -34);
      ctx.stroke();
      ctx.fillStyle = "#bff3ff";
      ctx.shadowColor = "#7fe6ff";
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.arc(-36, -34, 5 + Math.sin(t * 4) * 0.8, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#e8f4fa";
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(-24 + i * 5, 6);
        ctx.lineTo(-22 + i * 5, 13);
        ctx.lineTo(-20 + i * 5, 6);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(-14, -5, 2.5, 0, TAU);
      ctx.fill();
      break;
    }
    case "gulper": {
      ctx.strokeStyle = "#1a232b";
      ctx.lineCap = "round";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.quadraticCurveTo(-40, 14 + Math.sin(t * 2) * 6, -76, 6);
      ctx.stroke();
      ctx.fillStyle = "#1a232b";
      ctx.beginPath();
      ctx.moveTo(-6, -12);
      ctx.lineTo(22, -14);
      ctx.lineTo(30, -2);
      ctx.lineTo(10, 12);
      ctx.lineTo(-6, 10);
      ctx.fill();
      ctx.fillStyle = "#e8f4fa";
      ctx.beginPath();
      ctx.arc(14, -8, 2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ff8fb0";
      ctx.shadowColor = "#ff8fb0";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(-76, 6, 3.5, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      break;
    }
    case "dumbo": {
      const f = Math.sin(t * 3) * 0.35;
      ctx.fillStyle = "rgba(245,195,205,.92)";
      ctx.beginPath();
      ctx.ellipse(0, 0, 17, 14, 0, 0, TAU);
      ctx.fill();
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(sd * 20, -6, 10, 5, sd * (-0.5 + f), 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(245,195,205,.8)";
      ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 5, 12);
        ctx.lineTo(i * 6, 22);
        ctx.stroke();
      }
      ctx.fillStyle = "#2b1a22";
      ctx.beginPath();
      ctx.arc(-6, -2, 2, 0, TAU);
      ctx.arc(6, -2, 2, 0, TAU);
      ctx.fill();
      break;
    }
    case "cuc": {
      ctx.fillStyle = "rgba(232,180,160,.9)";
      ctx.beginPath();
      ctx.ellipse(0, 0, 28, 9, wob(1) * 0.15, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(232,180,160,.9)";
      ctx.lineWidth = 1.5;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 7, 6);
        ctx.lineTo(i * 7 + Math.sin(t * 2 + i) * 2, 13);
        ctx.stroke();
      }
      break;
    }
    case "snail": {
      const w = Math.sin(t * 3) * 5;
      ctx.fillStyle = "rgba(245,225,230,.9)";
      ctx.beginPath();
      ctx.ellipse(0, 0, 17, 12, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(14, -8);
      ctx.quadraticCurveTo(54, -6 + w, 74, 2);
      ctx.quadraticCurveTo(54, 12 + w, 14, 9);
      ctx.fill();
      ctx.fillStyle = "#31232a";
      ctx.beginPath();
      ctx.arc(-7, -3, 2.4, 0, TAU);
      ctx.fill();
      break;
    }
    case "amph": {
      ctx.strokeStyle = "rgba(235,200,170,.9)";
      ctx.fillStyle = "rgba(235,200,170,.85)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse(-i * 6, Math.sin(i * 0.9 + t * 3) * 1.5 + i * 0.8, 7 - i * 0.6, 4.5 - i * 0.3, 0, 0, TAU);
        ctx.fill();
      }
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-i * 6 - 3, 5);
        ctx.lineTo(-i * 6 - 6 + Math.sin(t * 4 + i) * 2, 12);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(6, -2);
      ctx.lineTo(17, -8);
      ctx.stroke();
      break;
    }
    case "xeno": {
      ctx.fillStyle = "rgba(232,222,200,.92)";
      for (const [a, b, r] of [[-12, 0, 9], [0, -3, 12], [13, 1, 8], [4, 5, 7]]) {
        ctx.beginPath();
        ctx.arc(a, b, r, 0, TAU);
        ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
};

const plates = (ctx: Ctx, W: number, H: number, alpha: number, t: number, since: number) => {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#010a12";
  ctx.fillRect(0, 0, W, H);
  // Slow push-in toward the trench, so the scene keeps moving while it's explained.
  const zoom = 1 + 0.12 * Math.min(1, since / 9);
  ctx.translate(W * 0.52, H * 0.5);
  ctx.scale(zoom, zoom);
  ctx.translate(-W * 0.52, -H * 0.5);
  const X = (f: number) => f * W;
  const Y = (f: number) => H * 0.3 + f * H * 0.5;
  ctx.fillStyle = "#0b3d63";
  ctx.fillRect(0, Y(0), W, Y(0.18) - Y(0));
  ctx.fillStyle = "#6d4a3a";
  ctx.beginPath();
  ctx.moveTo(X(1), Y(0.15));
  ctx.lineTo(X(0.66), Y(0.18));
  ctx.lineTo(X(0.52), Y(0.4));
  ctx.lineTo(X(1), Y(0.78));
  ctx.fill();
  ctx.fillStyle = "#3d2f4f";
  ctx.beginPath();
  ctx.moveTo(0, Y(0.2));
  ctx.lineTo(X(0.42), Y(0.22));
  ctx.lineTo(X(0.52), Y(0.4));
  ctx.lineTo(X(1), Y(0.82));
  ctx.lineTo(X(1), Y(1));
  ctx.lineTo(X(0.46), Y(0.56));
  ctx.lineTo(X(0.36), Y(0.4));
  ctx.lineTo(0, Y(0.4));
  ctx.fill();
  // Texture marks that drift toward the trench and down its slope: the plate visibly moving.
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 3;
  const path = (u: number): [number, number] =>
    u < 0.42 ? [X(u), Y(0.3)] : [X(0.42) + (u - 0.42) * W, Y(0.3) + ((u - 0.42) / 0.58) * (Y(0.9) - Y(0.3))];
  for (let k = 0; k < 12; k++) {
    const u = ((k / 12 + since * 0.03) % 1) * 1.0;
    const [px, py] = path(u);
    ctx.beginPath();
    ctx.moveTo(px - 14, py - 22);
    ctx.lineTo(px + 14, py + 22);
    ctx.stroke();
  }
  ctx.restore();
  const s = Math.sin(t * 2) * 10;
  const ax = X(0.2) + s;
  const ay = Y(0.31);
  ctx.strokeStyle = "#ffd37a";
  ctx.fillStyle = "#ffd37a";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(ax - 70, ay);
  ctx.lineTo(ax + 70, ay);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ax + 92, ay);
  ctx.lineTo(ax + 64, ay - 16);
  ctx.lineTo(ax + 64, ay + 16);
  ctx.fill();
  ctx.font = `600 40px "${FONT_FAMILY}"`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#e8f4fa";
  ctx.fillText("Pacific plate", X(0.22), Y(0.5));
  ctx.fillText("Philippine plate", X(0.8), Y(0.12) - 24);
  ctx.fillStyle = "#ffd37a";
  ctx.fillText("Mariana Trench", X(0.52), Y(-0.08));
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(X(0.52), Y(-0.06));
  ctx.lineTo(X(0.52), Y(0.37));
  ctx.stroke();
  ctx.restore();
};

/** Draws one frame of the descent. Pure function of (episode, time), so renders are repeatable. */
export const drawFrame = (ctx: Ctx, ep: Episode, W: number, H: number, t: number) => {
  const d = depthAt(ep, t);
  const pxPerM = H / 450;
  const sy = H * 0.44;
  const S = W / 560;
  const [r, g, b] = bgAt(ep, d);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, W, H);

  const surfaceY = sy - d * pxPerM;

  // Sun shafts near the surface
  if (d < 300) {
    const a = 1 - d / 300;
    ctx.fillStyle = `rgba(255,255,255,${0.08 * a})`;
    const top = Math.max(surfaceY, 0);
    for (let i = 0; i < 5; i++) {
      const x = W * (0.05 + 0.22 * i) + Math.sin(t * 0.4 + i) * 30;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + 110, top);
      ctx.lineTo(x + 420, H);
      ctx.lineTo(x + 220, H);
      ctx.fill();
    }
  }

  // Sky and waves
  if (surfaceY > 0) {
    const sky = ctx.createLinearGradient(0, 0, 0, surfaceY);
    sky.addColorStop(0, "#9fd6ee");
    sky.addColorStop(1, "#e3f4fb");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, surfaceY);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 10) ctx.lineTo(x, surfaceY + Math.sin(x * 0.02 + t * 2) * 6);
    ctx.stroke();
  }

  // Marine snow: positions come from a seeded random and the current depth, never from frame history
  const span = H + 20;
  for (let i = 0; i < 170; i++) {
    const z = 0.3 + 0.7 * random(`${ep.seed}-z-${i}`);
    const x0 = random(`${ep.seed}-x-${i}`) * W;
    const y0 = random(`${ep.seed}-y-${i}`) * span;
    const rad = (1.2 + random(`${ep.seed}-r-${i}`) * 2.4) * (W / 1080) * 1.6;
    const drift = d * pxPerM * z + 6 * t * (W / 1080) * 10;
    const y = ((((y0 - drift) % span) + span) % span) - 10;
    if (y < surfaceY) continue;
    const x = x0 + Math.sin(t * 0.6 + i) * 6;
    ctx.fillStyle = `rgba(210,235,245,${0.12 + 0.35 * z})`;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, TAU);
    ctx.fill();
  }

  // Seabed
  const floorY = sy + (ep.maxDepth + 55 - d) * pxPerM;
  if (d > ep.maxDepth - 700 && floorY < H + 80) {
    const sea = ctx.createLinearGradient(0, floorY, 0, floorY + 260);
    sea.addColorStop(0, "#2b2724");
    sea.addColorStop(1, "#0c0a09");
    ctx.fillStyle = sea;
    ctx.beginPath();
    ctx.moveTo(0, H + 80);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, floorY + Math.sin(x * 0.012) * 10 + Math.sin(x * 0.04) * 5);
    ctx.lineTo(W, H + 80);
    ctx.fill();
  }

  // Creatures, placed by depth
  ep.creatures.forEach((c, i) => {
    const y = sy + (c.depth - d) * pxPerM;
    if (y < -260 || y > H + 260) return;
    creature(ctx, c.kind, c.x * W + Math.sin(t * 0.8 + i) * 18, y, t, S, i);
  });

  // Submersible and its light
  const cx = W / 2;
  const cy = sy + Math.sin(t * 1.3) * 6;
  if (d > 120) {
    const a = Math.min(1, (d - 120) / 300);
    const beam = ctx.createLinearGradient(0, cy, 0, cy + H * 0.55);
    beam.addColorStop(0, `rgba(255,240,190,${0.34 * a})`);
    beam.addColorStop(1, "rgba(255,240,190,0)");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(cx + 22 * S, cy + 6 * S);
    ctx.lineTo(cx + 210 * S, cy + H * 0.55);
    ctx.lineTo(cx - 70 * S, cy + H * 0.55);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(S * 1.15, S * 1.15);
  ctx.fillStyle = "#b8c3c9";
  ctx.fillRect(-8, -30, 16, 10);
  ctx.fillStyle = "#f2f5f7";
  ctx.beginPath();
  ctx.ellipse(0, 0, 38, 22, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#b8c3c9";
  ctx.fillRect(-48, -5, 14, 10);
  ctx.fillStyle = "#0b2a3d";
  ctx.beginPath();
  ctx.arc(16, -3, 8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#fff3b8";
  ctx.beginPath();
  ctx.arc(34, 6, 3, 0, TAU);
  ctx.fill();
  ctx.restore();

  if (ep.platesAt !== undefined && t >= ep.platesAt) {
    plates(ctx, W, H, Math.min(1, (t - ep.platesAt) / 1.2), t, t - ep.platesAt);
  }
};
