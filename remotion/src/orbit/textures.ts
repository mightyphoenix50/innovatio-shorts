import { random } from "remotion";
import * as THREE from "three";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import land from "world-atlas/land-50m.json";
import type { OrbitEpisode } from "./types";

// Equirectangular maps: x = longitude -180..180, y = latitude 90..-90. Flat colours, crisp edges: vector-style.
const W = 2048;
const H = 1024;
type Ctx = CanvasRenderingContext2D;
type Body = OrbitEpisode["body"];

const px = (lon: number, lat: number): [number, number] => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];

const canvas = () => {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return [c, c.getContext("2d") as Ctx] as const;
};

const toTexture = (c: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
};

/** A soft irregular blob, for maria, dust, storms and clouds. Drawn wrapped across the date line. */
const blob = (ctx: Ctx, cx: number, cy: number, r: number, seed: string, wobble = 0.35, wrap = true) => {
  const pts = 18;
  const draw = (ox: number) => {
    ctx.beginPath();
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const rr = r * (1 - wobble / 2 + wobble * random(`${seed}-${i % pts}`));
      const x = cx + ox + Math.cos(a) * rr * 1.6; // wider than tall: equirect stretch
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  };
  draw(0);
  if (wrap && cx - r * 1.6 < 0) draw(W);
  if (wrap && cx + r * 1.6 > W) draw(-W);
};

const crater = (ctx: Ctx, x: number, y: number, r: number, floor: string, rim: string) => {
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.12, y - r * 0.1, r * 1.6, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = floor;
  ctx.beginPath();
  ctx.ellipse(x + r * 0.08, y + r * 0.06, r * 1.35, r * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();
};

const caps = (ctx: Ctx, colour: string, northLat: number, southLat: number) => {
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, W, px(0, northLat)[1]);
  ctx.fillRect(0, px(0, southLat)[1], W, H);
};

type Ring = [number, number][];

const earthLand = (() => {
  let cache: Ring[] | null = null;
  return () => {
    if (cache) return cache;
    const topo = land as unknown as Topology<{ land: GeometryCollection }>;
    const fc = feature(topo, topo.objects.land) as unknown as GeoJSON.FeatureCollection<GeoJSON.MultiPolygon | GeoJSON.Polygon>;
    const rings: Ring[] = [];
    for (const f of fc.features) {
      const g = f.geometry;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      for (const poly of polys) for (const r of poly) rings.push(r as Ring);
    }
    cache = rings;
    return rings;
  };
})();

/**
 * Rings that cross the date line are unwrapped into one continuous shape and drawn again one map-width
 * to the left or right, so nothing streaks across the map and both edges are filled.
 */
const tracePath = (ctx: Ctx, rings: Ring[]) => {
  ctx.beginPath();
  for (const r of rings) {
    const pts: [number, number][] = [];
    let shift = 0;
    r.forEach(([lon, lat], i) => {
      if (i > 0) {
        const d = lon - r[i - 1][0];
        if (d > 180) shift -= 360;
        else if (d < -180) shift += 360;
      }
      pts.push(px(lon + shift, lat));
    });
    const minX = Math.min(...pts.map((q) => q[0]));
    const maxX = Math.max(...pts.map((q) => q[0]));
    const offsets = [0, ...(minX < 0 ? [W] : []), ...(maxX > W ? [-W] : [])];
    for (const o of offsets) {
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x + o, y) : ctx.lineTo(x + o, y)));
      ctx.closePath();
    }
  }
};

const ringCentre = (r: Ring) => {
  let lat = 0;
  let lon = 0;
  for (const [a, b] of r) {
    lon += a;
    lat += b;
  }
  return [lon / r.length, lat / r.length];
};

const drawEarth = (ctx: Ctx) => {
  ctx.fillStyle = "#1F5FAE";
  ctx.fillRect(0, 0, W, H);
  const rings = earthLand();
  // Shallow continental shelf: a wide light stroke under the land.
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#2F86D6";
  ctx.lineWidth = 16;
  tracePath(ctx, rings);
  ctx.stroke();
  ctx.strokeStyle = "#3C9BE6";
  ctx.lineWidth = 7;
  ctx.stroke();
  // Land, with a darker edge like a vector illustration. Ice sheets white.
  const icy = rings.filter((r) => {
    const [lon, lat] = ringCentre(r);
    return lat < -60 || (lat > 59 && lon > -75 && lon < -10 && r.length > 200);
  });
  const green = rings.filter((r) => !icy.includes(r));
  tracePath(ctx, green);
  ctx.fillStyle = "#5DBB63";
  ctx.fill("evenodd");
  ctx.strokeStyle = "#3E9A55";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Deserts: warm patches over the dry belts, clipped to land.
  ctx.save();
  tracePath(ctx, green);
  ctx.clip("evenodd");
  ctx.fillStyle = "#D9B46A";
  for (const [lon, lat, r, s] of [
    [15, 23, 70, "sahara"],
    [45, 22, 45, "arabia"],
    [133, -25, 55, "outback"],
    [-112, 32, 28, "sonora"],
    [65, 40, 35, "kyzyl"],
    [100, 42, 40, "gobi"],
    [-69, -25, 18, "atacama"],
    [20, -24, 28, "kalahari"],
  ] as const) {
    const [x, y] = px(lon, lat);
    blob(ctx, x, y, r, `earth-${s}`, 0.4, false);
  }
  ctx.fillStyle = "#3E9A55";
  for (const [lon, lat, r, s] of [
    [-62, -5, 45, "amazon"],
    [22, 0, 32, "congo"],
    [110, 0, 30, "indo"],
    [90, 60, 55, "taiga"],
    [-100, 56, 45, "boreal"],
  ] as const) {
    const [x, y] = px(lon, lat);
    blob(ctx, x, y, r, `earth-${s}`, 0.45, false);
  }
  ctx.restore();
  tracePath(ctx, icy);
  ctx.fillStyle = "#F2F7FC";
  ctx.fill("evenodd");
  // Arctic sea ice.
  ctx.fillStyle = "#E6F1FA";
  ctx.fillRect(0, 0, W, px(0, 80)[1]);
};

const drawRocky = (ctx: Ctx, seed: string, pal: { base: string; dark: string; floor: string; rim: string; cap?: string }, craters: number, maria: number) => {
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = pal.dark;
  for (let i = 0; i < maria; i++) {
    blob(ctx, random(`${seed}-mx${i}`) * W, H * (0.25 + 0.5 * random(`${seed}-my${i}`)), 40 + 90 * random(`${seed}-mr${i}`), `${seed}-m${i}`, 0.5);
  }
  for (let i = 0; i < craters; i++) {
    const r = 4 + Math.pow(random(`${seed}-cr${i}`), 3) * 34;
    crater(ctx, random(`${seed}-cx${i}`) * W, H * (0.08 + 0.84 * random(`${seed}-cy${i}`)), r, pal.floor, pal.rim);
  }
  if (pal.cap) caps(ctx, pal.cap, 82, -84);
};

const drawGas = (ctx: Ctx, seed: string, colours: readonly [string, string, string]) => {
  const bands = 14;
  for (let i = 0; i < bands; i++) {
    const y0 = (i / bands) * H;
    const h = H / bands;
    ctx.fillStyle = colours[i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2];
    ctx.beginPath();
    ctx.moveTo(0, y0);
    for (let x = 0; x <= W; x += 32) ctx.lineTo(x, y0 + Math.sin(x / 90 + i * 1.7) * 6 * random(`${seed}-b${i}`));
    ctx.lineTo(W, y0 + h + 8);
    ctx.lineTo(0, y0 + h + 8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = colours[2];
  for (let i = 0; i < 10; i++) blob(ctx, random(`${seed}-sx${i}`) * W, H * (0.2 + 0.6 * random(`${seed}-sy${i}`)), 8 + 14 * random(`${seed}-sr${i}`), `${seed}-s${i}`, 0.3);
};

const drawIce = (ctx: Ctx, seed: string) => {
  ctx.fillStyle = "#DCEBF5";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#C2DAEA";
  for (let i = 0; i < 16; i++) blob(ctx, random(`${seed}-ix${i}`) * W, random(`${seed}-iy${i}`) * H, 30 + 70 * random(`${seed}-ir${i}`), `${seed}-i${i}`, 0.5);
  ctx.strokeStyle = "#B06A4E";
  ctx.lineCap = "round";
  for (let i = 0; i < 45; i++) {
    let x = random(`${seed}-lx${i}`) * W;
    let y = H * (0.1 + 0.8 * random(`${seed}-ly${i}`));
    const ang = random(`${seed}-la${i}`) * Math.PI;
    ctx.lineWidth = 2 + 4 * random(`${seed}-lw${i}`);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += Math.cos(ang + (random(`${seed}-l${i}-${k}`) - 0.5) * 0.5) * 60;
      y += Math.sin(ang + (random(`${seed}-m${i}-${k}`) - 0.5) * 0.5) * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
};

const drawLava = (ctx: Ctx, seed: string) => {
  ctx.fillStyle = "#2B1E24";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#3D2A30";
  for (let i = 0; i < 20; i++) blob(ctx, random(`${seed}-px${i}`) * W, random(`${seed}-py${i}`) * H, 30 + 60 * random(`${seed}-pr${i}`), `${seed}-p${i}`, 0.5);
  ctx.lineCap = "round";
  for (let i = 0; i < 60; i++) {
    let x = random(`${seed}-cx${i}`) * W;
    let y = random(`${seed}-cy${i}`) * H;
    ctx.strokeStyle = random(`${seed}-cc${i}`) > 0.5 ? "#F09A3E" : "#E8572A";
    ctx.lineWidth = 2 + 5 * random(`${seed}-cw${i}`);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (random(`${seed}-dx${i}-${k}`) - 0.5) * 120;
      y += (random(`${seed}-dy${i}-${k}`) - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = "#F7C04A";
  for (let i = 0; i < 18; i++) blob(ctx, random(`${seed}-vx${i}`) * W, random(`${seed}-vy${i}`) * H, 5 + 9 * random(`${seed}-vr${i}`), `${seed}-v${i}`, 0.3);
};

export const surfaceTexture = (body: Body, seed: string): THREE.Texture => {
  const [c, ctx] = canvas();
  switch (body.kind) {
    case "earth":
      drawEarth(ctx);
      break;
    case "mars":
      drawRocky(ctx, seed, { base: "#C9643B", dark: "#8E3F28", floor: "#B2552F", rim: "#DA7A4E", cap: "#F3E9E2" }, 140, 14);
      break;
    case "moon":
      drawRocky(ctx, seed, { base: "#B9B6C2", dark: "#7E7A8C", floor: "#A19DAD", rim: "#CFCCD8" }, 260, 10);
      break;
    case "mercury":
      drawRocky(ctx, seed, { base: "#9E9188", dark: "#7A6E67", floor: "#8B7F77", rim: "#B5AAA1" }, 320, 4);
      break;
    case "venus":
      drawGas(ctx, seed, ["#F3D9A4", "#E8C27E", "#D6A45E"]);
      break;
    case "gas":
      drawGas(ctx, seed, (body.colours ?? ["#F2DEC0", "#D9A56B", "#B6703F"]) as [string, string, string]);
      break;
    case "ice":
      drawIce(ctx, seed);
      break;
    case "lava":
      drawLava(ctx, seed);
      break;
  }
  return toTexture(c);
};

/** Transparent cloud layer for Earth, a little above the surface. */
export const cloudTexture = (seed: string): THREE.Texture => {
  const [c, ctx] = canvas();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  for (let i = 0; i < 70; i++) {
    const lat = (random(`${seed}-cl${i}`) - 0.5) * 140;
    const [x, y] = px(random(`${seed}-cn${i}`) * 360 - 180, lat);
    const r = 10 + 22 * random(`${seed}-cs${i}`);
    for (let k = 0; k < 3; k++) blob(ctx, x + (k - 1) * r * 1.5, y + (k === 1 ? -r * 0.35 : 0), r * (k === 1 ? 1.1 : 0.8), `${seed}-c${i}-${k}`, 0.3);
  }
  return toTexture(c);
};

export const ringTexture = (seed: string, colours: readonly string[]): THREE.Texture => {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 8;
  const ctx = c.getContext("2d") as Ctx;
  for (let x = 0; x < 1024; x += 4) {
    const gap = random(`${seed}-gap${Math.floor(x / 40)}`) < 0.18;
    ctx.globalAlpha = gap ? 0.08 : 0.55 + 0.4 * random(`${seed}-rg${x}`);
    ctx.fillStyle = colours[Math.floor(random(`${seed}-rc${Math.floor(x / 24)}`) * colours.length)];
    ctx.fillRect(x, 0, 4, 8);
  }
  return toTexture(c);
};

/** Three-step toon ramp: hard-edged light, mid and shadow, like flat vector shading. */
export const toonRamp = (): THREE.Texture => {
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
};
