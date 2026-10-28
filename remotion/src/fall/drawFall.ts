import { random } from "remotion";
import type { FallEpisode } from "./types";

export const UI_FONT = "Outfit";
type Ctx = CanvasRenderingContext2D;
export const TAU = Math.PI * 2;

// Palette from the reference style: flat vector, warm skies, charcoal characters, dark cards with gold borders.
export const PAL = {
  ink: "#1F1E1E",
  cream: "#E8DAC8",
  coral: "#E29578",
  dusk: "#5C4D7D",
  card: "rgba(26,34,47,0.9)",
  gold: "#E9C46A",
  goldDeep: "#D4AF37",
  white: "#F4F4F6",
  jacket: "#E0A93B",
  teal: "#2A9D8F",
  red: "#E63946",
  blueprint: "#0D1B2A",
  blueprintGrid: "#1B263B",
};

export const mix = (a: number, b: number, f: number) => a + (b - a) * f;
export const smooth = (f: number) => f * f * (3 - 2 * f);

export const lerpTable = (table: [number, number][], x: number) => {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [a, va] = table[i];
    const [b, vb] = table[i + 1];
    if (x <= b) return mix(va, vb, (x - a) / (b - a || 1));
  }
  return table[table.length - 1][1];
};

export const depthAt = (ep: FallEpisode, t: number) => {
  const k = ep.keyframes;
  if (t <= k[0][0]) return k[0][1];
  for (let i = 0; i < k.length - 1; i++) {
    const [a, da] = k[i];
    const [b, db] = k[i + 1];
    if (t <= b) return mix(da, db, smooth((t - a) / (b - a || 1)));
  }
  return k[k.length - 1][1];
};

export const roundRect = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/** A dark pill card with a thin gold border, as in the reference's data cards. */
export const pill = (ctx: Ctx, cx: number, cy: number, text: string, size = 30) => {
  ctx.save();
  ctx.font = `700 ${size}px "${UI_FONT}"`;
  const w = ctx.measureText(text).width + size * 1.4;
  const h = size * 1.9;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = PAL.card;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = PAL.gold;
  ctx.stroke();
  ctx.fillStyle = PAL.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + 1);
  ctx.restore();
};

/** The character: charcoal stick figure, white oval eyes, expressive brows, gold jacket. */
export const character = (
  ctx: Ctx,
  x: number,
  y: number,
  s: number,
  pose: "stand" | "trip" | "fall",
  t: number,
  worry: number,
  sweat: number,
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 7;
  const flail = pose === "fall" ? Math.sin(t * 9) : 0;
  const tilt = pose === "trip" ? 0.35 : pose === "fall" ? Math.sin(t * 2.2) * 0.12 : 0;
  ctx.rotate(tilt);
  // legs
  ctx.beginPath();
  if (pose === "stand") {
    ctx.moveTo(-10, 40); ctx.lineTo(-14, 92);
    ctx.moveTo(10, 40); ctx.lineTo(14, 92);
  } else {
    ctx.moveTo(-10, 40); ctx.lineTo(-30 - flail * 8, 70); ctx.lineTo(-22, 98);
    ctx.moveTo(10, 40); ctx.lineTo(32 + flail * 8, 66); ctx.lineTo(26, 94);
  }
  ctx.stroke();
  // arms
  ctx.beginPath();
  if (pose === "stand") {
    ctx.moveTo(-22, -6); ctx.lineTo(-34, 36);
    ctx.moveTo(22, -6); ctx.lineTo(34, 36);
  } else {
    ctx.moveTo(-22, -8); ctx.lineTo(-52, -40 + flail * 14); ctx.lineTo(-58, -78 + flail * 10);
    ctx.moveTo(22, -8); ctx.lineTo(52, -40 - flail * 14); ctx.lineTo(60, -76 - flail * 10);
  }
  ctx.stroke();
  // torso: gold jacket over white shirt
  roundRect(ctx, -26, -16, 52, 64, 22);
  ctx.fillStyle = PAL.jacket;
  ctx.fill();
  roundRect(ctx, -8, -14, 16, 56, 8);
  ctx.fillStyle = PAL.white;
  ctx.fill();
  // head
  ctx.beginPath();
  ctx.arc(0, -52, 34, 0, TAU);
  ctx.fillStyle = PAL.ink;
  ctx.fill();
  // eyes
  const eyeH = 12 + worry * 4;
  for (const ex of [-12, 12]) {
    ctx.beginPath();
    ctx.ellipse(ex, -54, 8, eyeH, 0, 0, TAU);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + (pose === "fall" ? 0 : 2), -52 + (pose === "fall" ? 5 : 2), 3.6, 0, TAU);
    ctx.fillStyle = "#000000";
    ctx.fill();
  }
  // brows: tilt up in the middle when worried
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-21, -74 + worry * 2); ctx.lineTo(-5, -76 - worry * 6);
  ctx.moveTo(21, -74 + worry * 2); ctx.lineTo(5, -76 - worry * 6);
  ctx.stroke();
  // sweat drops when it gets hot
  if (sweat > 0) {
    ctx.fillStyle = `rgba(160,220,255,${Math.min(1, sweat)})`;
    for (let i = 0; i < 3; i++) {
      const p = (t * 1.4 + i / 3) % 1;
      const sx = (i - 1) * 30 + (i === 1 ? 44 : 0);
      ctx.beginPath();
      ctx.ellipse(sx, -70 - p * 40, 4, 7, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
};

const miner = (ctx: Ctx, x: number, y: number, s: number, dir: number, t: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * dir, s);
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, 40);
  ctx.moveTo(0, 40); ctx.lineTo(-10, 70); ctx.moveTo(0, 40); ctx.lineTo(10, 70);
  ctx.moveTo(0, 12); ctx.lineTo(22, 22 + Math.sin(t * 6) * 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -16, 16, 0, TAU);
  ctx.fillStyle = PAL.ink;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -28, 20, 9, 0, Math.PI, 0);
  ctx.fillStyle = PAL.jacket;
  ctx.fill();
  ctx.fillStyle = "rgba(255,240,180,0.25)";
  ctx.beginPath();
  ctx.moveTo(14, -28); ctx.lineTo(120, -60); ctx.lineTo(120, 0);
  ctx.fill();
  ctx.fillStyle = "#FFF6C8";
  ctx.beginPath();
  ctx.arc(14, -28, 4, 0, TAU);
  ctx.fill();
  ctx.restore();
};

export const drawWorld = (ctx: Ctx, ep: FallEpisode, W: number, H: number, t: number) => {
  const s = W / 1080;
  const d = depthAt(ep, t);
  const V = (dd: number) => lerpTable(ep.visualScale, dd);
  const charY = H * 0.42;
  const cam = V(d);
  const groundY = (dd: number) => charY + 120 * s + V(dd) - cam;
  const y0 = groundY(0);
  const shaftW = 230 * s;
  const sx0 = W / 2 - shaftW / 2;

  // Sky and surface scene
  ctx.fillStyle = "#2B211C";
  ctx.fillRect(0, 0, W, H);
  if (y0 > 0) {
    const sky = ctx.createLinearGradient(0, y0 - H, 0, y0);
    sky.addColorStop(0, PAL.cream);
    sky.addColorStop(1, PAL.coral);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, y0);
    ctx.fillStyle = "#F6E7C8";
    ctx.beginPath();
    ctx.arc(W * 0.78, y0 - 520 * s, 70 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,250,240,0.8)";
    for (let k = 0; k < 3; k++) {
      const cxx = ((k * 420 + t * 60) * s) % (W + 400 * s) - 200 * s;
      const cyy = y0 - (700 + k * 140) * s;
      for (const [dx, dy, r] of [[0, 0, 50], [55, -20, 60], [115, 0, 48]]) {
        ctx.beginPath(); ctx.arc(cxx + dx * s, cyy + dy * s, r * s, 0, TAU); ctx.fill();
      }
    }
    ctx.fillStyle = "#D8A48F";
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.quadraticCurveTo(W * 0.2, y0 - 170 * s, W * 0.45, y0 - 40 * s);
    ctx.quadraticCurveTo(W * 0.7, y0 - 200 * s, W, y0 - 60 * s);
    ctx.lineTo(W, y0);
    ctx.fill();
    // warning sign beside the hole
    const sgx = W / 2 + 230 * s;
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 6 * s;
    ctx.beginPath();
    ctx.moveTo(sgx, y0); ctx.lineTo(sgx, y0 - 120 * s);
    ctx.stroke();
    ctx.fillStyle = PAL.jacket;
    roundRect(ctx, sgx - 70 * s, y0 - 190 * s, 140 * s, 74 * s, 10 * s);
    ctx.fill();
    ctx.fillStyle = PAL.ink;
    ctx.font = `700 ${34 * s}px "${UI_FONT}"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("HOLE", sgx, y0 - 152 * s);
  }

  // Layers with their textures (world-anchored, so they scroll with the fall)
  ep.layers.forEach((L, li) => {
    const ya = Math.max(groundY(L.from), -10);
    const yb = Math.min(groundY(L.to), H + 10);
    if (yb <= ya) return;
    const g = ctx.createLinearGradient(0, groundY(L.from), 0, groundY(L.to));
    g.addColorStop(0, L.colourTop);
    g.addColorStop(1, L.colourBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, ya, W, yb - ya);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, ya, W, yb - ya);
    ctx.clip();
    const top = V(L.from);
    const span = V(L.to) - top;
    const n = Math.max(6, Math.round(span / 40));
    for (let i = 0; i < n; i++) {
      const wy = groundY(L.from) + random(`${ep.seed}-${li}-y-${i}`) * (groundY(L.to) - groundY(L.from));
      if (wy < ya - 60 || wy > yb + 60) continue;
      const wx = random(`${ep.seed}-${li}-x-${i}`) * W;
      const r = random(`${ep.seed}-${li}-r-${i}`);
      switch (L.texture) {
        case "soil":
          ctx.fillStyle = "rgba(60,40,28,0.35)";
          ctx.beginPath();
          ctx.ellipse(wx, wy, (6 + r * 10) * s, (4 + r * 6) * s, r, 0, TAU);
          ctx.fill();
          break;
        case "strata":
          ctx.strokeStyle = "rgba(255,235,210,0.18)";
          ctx.lineWidth = (3 + r * 4) * s;
          ctx.beginPath();
          ctx.moveTo(0, wy);
          for (let x = 0; x <= W; x += 60 * s) ctx.lineTo(x, wy + Math.sin(x * 0.004 + i) * 14 * s);
          ctx.stroke();
          break;
        case "granite":
          ctx.fillStyle = r > 0.5 ? "rgba(255,255,255,0.18)" : "rgba(20,15,12,0.25)";
          ctx.beginPath();
          ctx.arc(wx, wy, (3 + r * 5) * s, 0, TAU);
          ctx.fill();
          break;
        case "mantle": {
          ctx.strokeStyle = "rgba(255,200,120,0.22)";
          ctx.lineWidth = 6 * s;
          const rr = (90 + r * 120) * s;
          ctx.beginPath();
          ctx.arc(wx, wy, rr, t * 0.3 + r * 6, t * 0.3 + r * 6 + 2.2);
          ctx.stroke();
          ctx.fillStyle = "rgba(255,170,80,0.35)";
          ctx.beginPath();
          ctx.arc(wx + rr * Math.cos(t * 0.3 + r * 6 + 2.2), wy + rr * Math.sin(t * 0.3 + r * 6 + 2.2), 7 * s, 0, TAU);
          ctx.fill();
          break;
        }
        case "liquid":
          ctx.strokeStyle = "rgba(255,240,190,0.35)";
          ctx.lineWidth = 5 * s;
          ctx.beginPath();
          for (let x = 0; x <= W; x += 30 * s) ctx.lineTo(x, wy + Math.sin(x * 0.012 + t * 2.4 + i) * 12 * s);
          ctx.stroke();
          break;
        case "crystal": {
          ctx.strokeStyle = "rgba(255,255,255,0.5)";
          ctx.fillStyle = "rgba(255,255,255,0.12)";
          ctx.lineWidth = 3 * s;
          const c = (30 + r * 50) * s;
          ctx.beginPath();
          ctx.moveTo(wx, wy - c); ctx.lineTo(wx + c * 0.7, wy); ctx.lineTo(wx, wy + c); ctx.lineTo(wx - c * 0.7, wy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;
        }
      }
    }
    ctx.restore();
  });

  // The shaft: darker, with lit edges
  if (y0 < H) {
    const st = Math.max(y0, 0);
    ctx.fillStyle = "rgba(10,6,4,0.45)";
    ctx.fillRect(sx0, st, shaftW, H - st);
    ctx.fillStyle = "rgba(255,230,190,0.25)";
    ctx.fillRect(sx0 - 4 * s, st, 6 * s, H - st);
    ctx.fillRect(sx0 + shaftW - 2 * s, st, 6 * s, H - st);
  }

  // Landmarks
  for (const L of ep.landmarks) {
    const y = groundY(L.depth);
    if (y < -300 || y > H + 300) continue;
    const dir = L.side === "left" ? -1 : 1;
    const edge = dir < 0 ? sx0 : sx0 + shaftW;
    if (L.kind === "mine") {
      const w = 400 * s;
      const x = dir < 0 ? edge - w : edge;
      ctx.fillStyle = "rgba(20,12,8,0.75)";
      ctx.fillRect(x, y - 70 * s, w, 110 * s);
      ctx.strokeStyle = "#8A6A45";
      ctx.lineWidth = 10 * s;
      for (let k = 0; k < 3; k++) {
        const px = x + (60 + k * 140) * s;
        ctx.beginPath();
        ctx.moveTo(px, y + 40 * s); ctx.lineTo(px, y - 70 * s); ctx.lineTo(px + 70 * s, y - 70 * s);
        ctx.stroke();
      }
      miner(ctx, edge + dir * 150 * s, y - 34 * s, 0.9 * s, -dir, t);
      miner(ctx, edge + dir * 300 * s, y - 34 * s, 0.9 * s, -dir, t + 1);
      pill(ctx, edge + dir * 200 * s, y - 130 * s, L.label, 26 * s);
    } else if (L.kind === "borehole") {
      const x = edge + dir * 90 * s;
      ctx.strokeStyle = "#9AA3AD";
      ctx.lineWidth = 12 * s;
      ctx.beginPath();
      ctx.moveTo(x, Math.max(y0, -20)); ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = "#C9CED4";
      ctx.beginPath();
      ctx.moveTo(x - 18 * s, y); ctx.lineTo(x + 18 * s, y); ctx.lineTo(x, y + 40 * s);
      ctx.fill();
      pill(ctx, x + dir * 120 * s, y + 10 * s, L.label, 26 * s);
    } else if (L.kind === "boundary") {
      const ly = y - 50 * s < 520 * s ? y + 50 * s : y - 50 * s;
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 4 * s;
      ctx.setLineDash([18 * s, 14 * s]);
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(W, y);
      ctx.stroke();
      ctx.setLineDash([]);
      pill(ctx, edge + dir * 230 * s, ly, L.label, 26 * s);
    } else if (L.kind === "center") {
      const g = ctx.createRadialGradient(W / 2, y, 0, W / 2, y, 420 * s);
      g.addColorStop(0, "rgba(255,255,230,0.95)");
      g.addColorStop(0.3, "rgba(255,230,150,0.45)");
      g.addColorStop(1, "rgba(255,200,100,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 420 * s, W, 840 * s);
      pill(ctx, W / 2, y + 150 * s, L.label, 28 * s);
    }
  }

  // Speed streaks around the falling character
  const v = Math.abs(V(depthAt(ep, t + 0.05)) - V(depthAt(ep, t - 0.05))) * 10;
  if (t > ep.fallAt && v > 20) {
    const a = Math.min(0.5, v / 4000);
    ctx.strokeStyle = `rgba(255,248,230,${a})`;
    ctx.lineWidth = 4 * s;
    for (let i = 0; i < 14; i++) {
      const x = sx0 + random(`${ep.seed}-sx-${i}`) * shaftW;
      const len = (80 + random(`${ep.seed}-sl-${i}`) * 220) * s;
      const yy = ((random(`${ep.seed}-sy-${i}`) * H - t * 2400 * s) % H + H) % H;
      ctx.beginPath();
      ctx.moveTo(x, yy); ctx.lineTo(x, yy + len);
      ctx.stroke();
    }
  }

  // The character: stands, trips at fallAt, then falls with the camera
  const temp = lerpTable(ep.temperature, d);
  const before = t < ep.fallAt - 0.7;
  const tripping = !before && t < ep.fallAt;
  const walk = before ? 0 : Math.min(1, (t - (ep.fallAt - 0.7)) / 0.7);
  const cx = mix(W / 2 - 170 * s, W / 2, smooth(walk));
  const standY = y0 - 98 * 1.25 * s;
  const bob = before ? Math.sin(t * 5) * 4 * s : 0;
  const cy = t < ep.fallAt ? standY + bob + (tripping ? walk * 30 * s : 0) : Math.max(charY, standY);
  const worry = before ? 0.2 : 1;
  character(ctx, cx, cy, 1.25 * s, before ? "stand" : tripping ? "trip" : "fall", t, worry, temp > 600 ? Math.min(1, (temp - 600) / 1500) : 0);
};

/** The closing diagram: a blueprint cross-section of Earth with you falling back and forth through it. */
export const drawDiagram = (ctx: Ctx, ep: FallEpisode, W: number, H: number, t: number, alpha: number) => {
  if (!ep.diagram || ep.diagramAt === undefined || alpha <= 0) return;
  const s = W / 1080;
  const tt = t - ep.diagramAt;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PAL.blueprint;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = PAL.blueprintGrid;
  ctx.lineWidth = 2 * s;
  // The grid drifts slowly, so the scene never sits still.
  const off = (tt * 18 * s) % (60 * s);
  for (let x = -60 * s + off; x <= W; x += 60 * s) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = -60 * s + off; y <= H; y += 60 * s) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  const cx = W / 2;
  const cy = H * 0.36;
  const R = 265 * s * (0.92 + 0.08 * smooth(Math.min(1, tt / 1.2)));
  const rings: [number, string][] = [
    [1, "#8A6A52"],
    [3480 / 6371, "#C2552E"],
    [1221 / 6371, "#F09A3E"],
  ];
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fillStyle = "#7A5C48"; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.985, 0, TAU); ctx.fillStyle = "#C2552E"; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, R * rings[1][0], 0, TAU); ctx.fillStyle = "#F09A3E"; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, R * rings[2][0], 0, TAU); ctx.fillStyle = "#FFE29A"; ctx.fill();
  // Mantle currents turning, the liquid core shimmering, and a slow pulse on the inner core.
  ctx.save();
  ctx.lineWidth = 4 * s;
  ctx.strokeStyle = "rgba(255,210,150,0.45)";
  for (let k = 0; k < 6; k++) {
    const a0 = tt * 0.5 + (k * TAU) / 6;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.78, a0, a0 + 0.55); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,245,200,0.5)";
  for (let k = 0; k < 8; k++) {
    const a0 = -tt * 0.8 + (k * TAU) / 8;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.4, a0, a0 + 0.35); ctx.stroke();
  }
  const pulse = 0.5 + 0.5 * Math.sin(tt * 3);
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (0.3 + 0.06 * pulse));
  glow.addColorStop(0, "rgba(255,255,235,0.9)");
  glow.addColorStop(1, "rgba(255,226,154,0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.36, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = PAL.white;
  ctx.lineWidth = 3 * s;
  ctx.setLineDash([14 * s, 10 * s]);
  ctx.beginPath(); ctx.moveTo(cx, cy - R - 30 * s); ctx.lineTo(cx, cy + R + 30 * s); ctx.stroke();
  ctx.setLineDash([]);
  // you, falling back and forth: a full swing every 7 seconds of video
  const p = Math.cos((TAU * Math.max(0, tt - 0.8)) / 7);
  const py = cy - R * p;
  // A fading trail shows which way you're moving.
  for (let k = 1; k <= 8; k++) {
    const pk = Math.cos((TAU * Math.max(0, tt - 0.8 - k * 0.06)) / 7);
    ctx.beginPath(); ctx.arc(cx, cy - R * pk, (22 - k * 2) * s, 0, TAU);
    ctx.fillStyle = `rgba(233,196,106,${0.35 - k * 0.04})`; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(cx, py, 24 * s, 0, TAU); ctx.fillStyle = PAL.ink; ctx.fill();
  ctx.lineWidth = 3 * s; ctx.strokeStyle = PAL.gold; ctx.stroke();
  for (const ex of [-8, 8]) {
    ctx.beginPath(); ctx.ellipse(cx + ex * s, py - 2 * s, 5 * s, 8 * s, 0, 0, TAU); ctx.fillStyle = "#fff"; ctx.fill();
  }
  pill(ctx, cx, cy - R - 60 * s, ep.diagram.start, 30 * s);
  pill(ctx, cx, cy + R + 70 * s, ep.diagram.end, 30 * s);
  pill(ctx, cx, H * 0.075, ep.diagram.timer, 40 * s);
  pill(ctx, cx, H * 0.075 + 90 * s, ep.diagram.speed, 30 * s);
  ctx.restore();
};
