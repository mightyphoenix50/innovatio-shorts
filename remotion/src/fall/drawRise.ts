import { random } from "remotion";
import { character, depthAt, lerpTable, mix, PAL, pill, roundRect, smooth, TAU } from "./drawFall";
import type { FallEpisode } from "./types";

type Ctx = CanvasRenderingContext2D;

const cloud = (ctx: Ctx, x: number, y: number, k: number, alpha: number) => {
  ctx.fillStyle = `rgba(255,252,246,${alpha})`;
  for (const [dx, dy, r] of [[0, 0, 50], [55, -22, 62], [118, 0, 48], [60, 14, 46]]) {
    ctx.beginPath();
    ctx.arc(x + dx * k, y + dy * k, r * k, 0, TAU);
    ctx.fill();
  }
};

const plane = (ctx: Ctx, x: number, y: number, k: number, dir: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k * dir, k);
  // contrail
  const g = ctx.createLinearGradient(-60, 0, -700, 0);
  g.addColorStop(0, "rgba(255,255,255,0.75)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-700, -4, 640, 8);
  ctx.fillStyle = PAL.white;
  roundRect(ctx, -80, -14, 170, 28, 14);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-10, 0); ctx.lineTo(-50, 52); ctx.lineTo(-24, 52); ctx.lineTo(30, 0);
  ctx.moveTo(-60, -10); ctx.lineTo(-84, -46); ctx.lineTo(-68, -46); ctx.lineTo(-40, -10);
  ctx.fill();
  ctx.fillStyle = "#3D5A80";
  for (let i = 0; i < 6; i++) ctx.fillRect(-40 + i * 18, -6, 9, 7);
  ctx.restore();
};

const balloon = (ctx: Ctx, x: number, y: number, k: number, t: number) => {
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 1.3) * 6 * k);
  ctx.scale(k, k);
  ctx.fillStyle = "rgba(246,240,230,0.92)";
  ctx.beginPath();
  ctx.moveTo(0, -60);
  ctx.bezierCurveTo(140, -80, 120, -330, 0, -340);
  ctx.bezierCurveTo(-120, -330, -140, -80, 0, -60);
  ctx.fill();
  ctx.strokeStyle = "rgba(31,30,30,0.6)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -60); ctx.lineTo(0, -10);
  ctx.stroke();
  ctx.fillStyle = "#C9CED4";
  roundRect(ctx, -34, -12, 68, 62, 14);
  ctx.fill();
  ctx.fillStyle = PAL.ink;
  ctx.beginPath();
  ctx.arc(0, 18, 14, 0, TAU);
  ctx.fill();
  ctx.restore();
};

const station = (ctx: Ctx, x: number, y: number, k: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = "#C9CED4";
  ctx.fillRect(-170, -6, 340, 12);
  roundRect(ctx, -40, -22, 80, 44, 12);
  ctx.fill();
  for (const px of [-150, -95, 95, 150]) {
    ctx.fillStyle = PAL.jacket;
    ctx.fillRect(px - 20, -90, 40, 76);
    ctx.fillRect(px - 20, 14, 40, 76);
    ctx.strokeStyle = "rgba(31,30,30,0.5)";
    ctx.lineWidth = 2;
    for (let j = 1; j < 4; j++) {
      ctx.beginPath(); ctx.moveTo(px - 20, -90 + j * 19); ctx.lineTo(px + 20, -90 + j * 19); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px - 20, 14 + j * 19); ctx.lineTo(px + 20, 14 + j * 19); ctx.stroke();
    }
  }
  ctx.restore();
};

export const drawRise = (ctx: Ctx, ep: FallEpisode, W: number, H: number, t: number) => {
  const s = W / 1080;
  const alt = depthAt(ep, t);
  const V = (a: number) => lerpTable(ep.visualScale, a);
  const charY = H * 0.44;
  const cam = V(alt);
  // Altitude grows upward on screen: the ground sits below the character and drops away.
  const skyY = (a: number) => charY + 140 * s - (V(a) - cam);
  const y0 = skyY(0);

  ctx.fillStyle = "#0B1020";
  ctx.fillRect(0, 0, W, H);

  // Sky layers, bottom to top
  ep.layers.forEach((L, li) => {
    const yTop = Math.max(skyY(L.to), -10);
    const yBot = Math.min(skyY(L.from), H + 10);
    if (yBot <= yTop) return;
    const g = ctx.createLinearGradient(0, skyY(L.from), 0, skyY(L.to));
    g.addColorStop(0, L.colourTop);
    g.addColorStop(1, L.colourBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, yTop, W, yBot - yTop);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, yTop, W, yBot - yTop);
    ctx.clip();
    const span = V(L.to) - V(L.from);
    const n = Math.max(6, Math.round(span / 70));
    for (let i = 0; i < n; i++) {
      const r = random(`${ep.seed}-${li}-r-${i}`);
      const wy = mix(skyY(L.from), skyY(L.to), random(`${ep.seed}-${li}-y-${i}`));
      if (wy < yTop - 120 || wy > yBot + 120) continue;
      const wx = random(`${ep.seed}-${li}-x-${i}`) * W;
      switch (L.texture) {
        case "cloud": {
          const x = ((wx + t * (20 + r * 30) * s) % (W + 300 * s)) - 150 * s;
          cloud(ctx, x, wy, (0.7 + r * 0.8) * s, 0.55 + r * 0.35);
          break;
        }
        case "ozone":
          ctx.strokeStyle = `rgba(190,170,255,${0.12 + r * 0.12})`;
          ctx.lineWidth = (8 + r * 14) * s;
          ctx.beginPath();
          for (let x = 0; x <= W; x += 40 * s) ctx.lineTo(x, wy + Math.sin(x * 0.006 + t * 0.6 + i) * 10 * s);
          ctx.stroke();
          break;
        case "haze":
          ctx.strokeStyle = `rgba(160,220,255,${0.15 + r * 0.2})`;
          ctx.lineWidth = 3 * s;
          ctx.beginPath();
          ctx.moveTo(wx - 160 * s, wy);
          ctx.quadraticCurveTo(wx, wy - 18 * s + Math.sin(t + i) * 6 * s, wx + 160 * s, wy);
          ctx.stroke();
          break;
        case "aurora": {
          const hue = r > 0.5 ? "120,255,190" : "170,130,255";
          ctx.strokeStyle = `rgba(${hue},${0.18 + r * 0.18})`;
          ctx.lineWidth = (16 + r * 20) * s;
          ctx.beginPath();
          for (let x = 0; x <= W; x += 30 * s) ctx.lineTo(x, wy + Math.sin(x * 0.008 + t * 1.2 + i * 2) * 26 * s);
          ctx.stroke();
          // falls through to a few stars as well
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.beginPath(); ctx.arc((wx * 1.7) % W, wy + 60 * s, 2.4 * s, 0, TAU); ctx.fill();
          break;
        }
        case "stars": {
          const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (1 + r * 2) + i));
          ctx.fillStyle = `rgba(255,255,255,${tw})`;
          ctx.beginPath(); ctx.arc(wx, wy, (1.5 + r * 2.5) * s, 0, TAU); ctx.fill();
          break;
        }
        default:
          break;
      }
    }
    ctx.restore();
  });

  // The ground and the start scene
  if (y0 < H + 40 * s) {
    ctx.fillStyle = "#8DB580";
    ctx.beginPath();
    ctx.moveTo(0, y0 + 30 * s);
    ctx.quadraticCurveTo(W * 0.25, y0 - 60 * s, W * 0.55, y0 + 10 * s);
    ctx.quadraticCurveTo(W * 0.8, y0 - 70 * s, W, y0 + 20 * s);
    ctx.lineTo(W, H + 400 * s);
    ctx.lineTo(0, H + 400 * s);
    ctx.fill();
    ctx.fillStyle = "#6E9A63";
    ctx.fillRect(0, y0 + 30 * s, W, H + 400 * s);
    // a tree and a house, so the ground reads as home
    ctx.fillStyle = "#7A5C48";
    ctx.fillRect(W * 0.16 - 10 * s, y0 - 90 * s, 20 * s, 110 * s);
    ctx.fillStyle = "#5E8C55";
    ctx.beginPath(); ctx.arc(W * 0.16, y0 - 120 * s, 70 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = "#F0E6D2";
    ctx.fillRect(W * 0.7, y0 - 120 * s, 170 * s, 130 * s);
    ctx.fillStyle = "#D8A48F";
    ctx.beginPath();
    ctx.moveTo(W * 0.7 - 20 * s, y0 - 120 * s); ctx.lineTo(W * 0.7 + 85 * s, y0 - 200 * s); ctx.lineTo(W * 0.7 + 190 * s, y0 - 120 * s);
    ctx.fill();
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(W * 0.7 + 66 * s, y0 - 60 * s, 40 * s, 70 * s);
  }

  // Landmark labels fade out behind the depth card (top) and the caption (bottom), so they never collide.
  const tag = (x: number, y: number, text: string) => {
    const a = Math.min(1, Math.max(0, (y - 560 * s) / (60 * s)), Math.max(0, (1130 * s - y) / (60 * s)));
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    pill(ctx, x, y, text, 26 * s);
    ctx.restore();
  };

  // Landmarks
  for (const L of ep.landmarks) {
    const y = skyY(L.depth);
    if (y < -420 * s || y > H + 900 * s) continue;
    const dir = L.side === "left" ? -1 : 1;
    const sideX = dir < 0 ? W * 0.2 : W * 0.8;
    if (L.kind === "mountain") {
      const px = dir < 0 ? W * 0.12 : W * 0.88;
      ctx.fillStyle = "#7D8AA0";
      ctx.beginPath();
      ctx.moveTo(px - 520 * s * -dir, y0 + 40 * s);
      ctx.lineTo(px, y);
      ctx.lineTo(px + 420 * s * -dir, y0 + 40 * s);
      ctx.fill();
      ctx.fillStyle = "#F4F4F6";
      ctx.beginPath();
      const f = 0.14;
      ctx.moveTo(px, y);
      ctx.lineTo(mix(px, px - 520 * s * -dir, f), mix(y, y0, f));
      ctx.lineTo(mix(px, px + 60 * s * -dir, f), mix(y, y0, f * 0.7));
      ctx.lineTo(mix(px, px + 420 * s * -dir, f), mix(y, y0, f));
      ctx.fill();
      tag(px + dir * -250 * s, y + 10 * s, L.label);
    } else if (L.kind === "plane") {
      const x = ((t * 240 * s) % (W + 900 * s)) - 450 * s;
      plane(ctx, dir < 0 ? W - x : x, y, 1.0 * s, dir < 0 ? -1 : 1);
      tag(sideX, y - 80 * s, L.label);
    } else if (L.kind === "balloon") {
      balloon(ctx, sideX, y, 1.0 * s, t);
      tag(sideX, y + 90 * s, L.label);
    } else if (L.kind === "station") {
      station(ctx, sideX + Math.sin(t * 0.4) * 40 * s, y, 1.0 * s);
      tag(sideX, y + 130 * s, L.label);
    } else if (L.kind === "boundary") {
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 4 * s;
      ctx.setLineDash([18 * s, 14 * s]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.setLineDash([]);
      const ly = y + 50 * s < 520 * s ? y + 50 * s : y - 50 * s;
      tag(W / 2 + dir * 250 * s, ly, L.label);
    }
  }

  // Air rushing past: streaks moving down around you
  const v = Math.abs(V(depthAt(ep, t + 0.05)) - V(depthAt(ep, t - 0.05))) * 10;
  if (t > ep.fallAt && v > 20) {
    const a = Math.min(0.45, v / 4000);
    ctx.strokeStyle = `rgba(255,255,255,${a})`;
    ctx.lineWidth = 4 * s;
    for (let i = 0; i < 12; i++) {
      const x = W / 2 + (random(`${ep.seed}-sx-${i}`) - 0.5) * 360 * s;
      const len = (80 + random(`${ep.seed}-sl-${i}`) * 200) * s;
      const yy = ((random(`${ep.seed}-sy-${i}`) * H + t * 2200 * s) % H + H) % H;
      ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x, yy + len); ctx.stroke();
    }
  }

  // You: stand on the ground, lift off at fallAt, then rise with the camera
  const lifting = t >= ep.fallAt - 0.5;
  const standY = y0 - 98 * 1.25 * s;
  const bob = Math.sin(t * 5) * 4 * s;
  const lift = Math.min(1, Math.max(0, (t - (ep.fallAt - 0.5)) / 0.5));
  const cy = !lifting ? standY + bob : Math.min(standY - smooth(lift) * 40 * s, charY + bob);
  const temp = lerpTable(ep.temperature, alt);
  const air = lerpTable(ep.pressure, alt);
  const worry = !lifting ? 0.2 : air < 40 ? 1 : 0.6;
  character(ctx, W / 2, cy, 1.25 * s, !lifting ? "stand" : "fall", t, worry, 0);
  // frosty breath when it's cold and there's still air to see it in
  if (lifting && temp < -20 && air > 2) {
    for (let k = 0; k < 3; k++) {
      const p = (t * 0.9 + k / 3) % 1;
      ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - p)})`;
      ctx.beginPath();
      ctx.arc(W / 2 + 40 * s + p * 70 * s, cy - 60 * s - p * 30 * s, (8 + p * 16) * s, 0, TAU);
      ctx.fill();
    }
  }
};

/** Closing diagram for rising episodes: zoom out from the edge of the air to the whole planet. */
export const drawAtmosphere = (ctx: Ctx, ep: FallEpisode, W: number, H: number, t: number, alpha: number) => {
  if (!ep.diagram || ep.diagramAt === undefined || alpha <= 0) return;
  const s = W / 1080;
  const tt = t - ep.diagramAt;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PAL.blueprint;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    const tw = 0.3 + 0.7 * Math.abs(Math.sin(tt * (0.8 + random(`st-${i}`) * 2) + i));
    ctx.fillStyle = `rgba(255,255,255,${tw * 0.8})`;
    ctx.beginPath();
    ctx.arc(random(`stx-${i}`) * W, random(`sty-${i}`) * H, (1 + random(`str-${i}`) * 2) * s, 0, TAU);
    ctx.fill();
  }
  const f = smooth(Math.min(1, Math.max(0, (tt - 0.3) / 2.6)));
  const R0 = 265 * s;
  const z = mix(4.5, 1, f);
  const R = R0 * z;
  const cx = W / 2;
  const cy = mix(H * 0.3 + R, H * 0.37, f);
  // the air: 100 km on a 6,371 km planet, drawn to scale (with a soft glow so it can be seen)
  const shell = R * (100 / 6371);
  const glow = ctx.createRadialGradient(cx, cy, R, cx, cy, R + shell * 6);
  glow.addColorStop(0, "rgba(110,190,255,0.55)");
  glow.addColorStop(1, "rgba(110,190,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, R + shell * 6, 0, TAU); ctx.fill();
  ctx.fillStyle = "#7EC8F0";
  ctx.beginPath(); ctx.arc(cx, cy, R + shell, 0, TAU); ctx.fill();
  ctx.fillStyle = "#2E6FA8";
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
  // flat continents, turning slowly
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
  ctx.fillStyle = "#6E9A63";
  for (let i = 0; i < 7; i++) {
    const a = random(`ct-${i}`) * TAU + tt * 0.12;
    const rr = R * (0.2 + random(`cr-${i}`) * 0.6);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.9;
    ctx.beginPath();
    ctx.ellipse(x, y, R * (0.12 + random(`cw-${i}`) * 0.16), R * (0.08 + random(`ch-${i}`) * 0.12), a, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // the station's orbit and the station going round
  const orbit = R * (6771 / 6371);
  ctx.strokeStyle = "rgba(233,196,106,0.8)";
  ctx.lineWidth = 3 * s;
  ctx.setLineDash([10 * s, 10 * s]);
  ctx.beginPath(); ctx.arc(cx, cy, orbit, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  const sa = -Math.PI / 2 + tt * 0.6;
  ctx.fillStyle = PAL.gold;
  ctx.beginPath(); ctx.arc(cx + Math.cos(sa) * orbit, cy + Math.sin(sa) * orbit, 9 * s, 0, TAU); ctx.fill();
  // you, at the top of the orbit
  const ya = cy - orbit;
  ctx.beginPath(); ctx.arc(cx, ya, 16 * s, 0, TAU); ctx.fillStyle = PAL.ink; ctx.fill();
  ctx.lineWidth = 3 * s; ctx.strokeStyle = PAL.gold; ctx.stroke();
  for (const ex of [-5, 5]) {
    ctx.beginPath(); ctx.ellipse(cx + ex * s, ya - 1 * s, 3.5 * s, 5.5 * s, 0, 0, TAU); ctx.fillStyle = "#fff"; ctx.fill();
  }
  const labels = Math.min(1, Math.max(0, (tt - 2.4) / 0.6));
  ctx.globalAlpha = alpha * labels;
  pill(ctx, cx, H * 0.075, ep.diagram.timer, 40 * s);
  pill(ctx, cx, H * 0.075 + 90 * s, ep.diagram.speed, 30 * s);
  pill(ctx, cx - 210 * s, cy - R - 120 * s, ep.diagram.start, 26 * s);
  pill(ctx, cx + 230 * s, cy + R * 0.82, ep.diagram.end, 26 * s);
  ctx.restore();
};
