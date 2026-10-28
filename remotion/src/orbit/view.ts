import { Easing, interpolate } from "remotion";
import * as THREE from "three";
import type { OrbitEpisode, Stop } from "./types";

export const FOV = 35;
export const FAR = 12; // camera distance at zoom 0: the world is small in space
export const NEAR = 4.4; // camera distance at zoom 1: the world overflows the screen sideways
/** The canvas is lifted so the world sits between the stat card and the caption. */
export const LIFT = 110;
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);
const smooth = (f: number) => f * f * (3 - 2 * f);
const turn = Easing.bezier(0.45, 0, 0.2, 1);

/** Same smoothstep easing between keyframes as the other templates (and scripts/episode_timing.py). */
export const zoomAt = (ep: OrbitEpisode, t: number) => {
  const k = ep.keyframes;
  if (t <= k[0][0]) return k[0][1];
  for (let i = 0; i < k.length - 1; i++) {
    const [a, za] = k[i];
    const [b, zb] = k[i + 1];
    if (t <= b) return za + (zb - za) * smooth(b > a ? (t - a) / (b - a) : 1);
  }
  return k[k.length - 1][1];
};

export const distanceAt = (ep: OrbitEpisode, t: number) => FAR + (NEAR - FAR) * zoomAt(ep, t);

/** Screen radius of the world in px, for the 2D glow and pins. */
export const screenRadius = (dist: number, height: number) => (1 / (dist * TAN)) * (height / 2);

/** A point on the unit sphere matching three.js SphereGeometry's equirectangular UVs. */
export const latLonToVec = (lat: number, lon: number, r = 1) => {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const theta = ((90 - lat) / 180) * Math.PI;
  return new THREE.Vector3(-Math.cos(phi) * Math.sin(theta) * r, Math.cos(theta) * r, Math.sin(phi) * Math.sin(theta) * r);
};

/** Rotation [x, y] that brings lat/lon to the front, facing the camera. */
const facing = (lat: number, lon: number): [number, number] => {
  const v = latLonToVec(lat, lon);
  return [THREE.MathUtils.degToRad(Math.max(-55, Math.min(55, lat))), -Math.atan2(v.x, v.z)];
};

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The stop for each line: its own, or the last one before it (so the globe holds its view). */
export const stopFor = (ep: OrbitEpisode, line: number): Stop | undefined =>
  [...ep.stops].filter((s) => s.line <= line).sort((a, b) => b.line - a.line)[0];

/** Globe rotation at time t: turns to each line's stop over its first 1.4 s, then drifts gently. */
export const rotationAt = (ep: OrbitEpisode, t: number): [number, number] => {
  const idx = Math.max(0, ep.narration.findIndex((n) => t < n.to));
  const lineIdx = t >= ep.narration[ep.narration.length - 1].to ? ep.narration.length - 1 : idx;
  const line = ep.narration[lineIdx];
  const here = stopFor(ep, lineIdx) ?? ep.stops[0];
  const before = stopFor(ep, lineIdx - 1) ?? here;
  const opening = ep.stops[0] ? facing(ep.stops[0].lat, ep.stops[0].lon - 50) : ([0.2, 0] as [number, number]);
  const from = lineIdx === 0 ? opening : before ? facing(before.lat, before.lon) : opening;
  const to = here ? facing(here.lat, here.lon) : opening;
  const f = turn(Math.min(1, Math.max(0, (t - line.from) / (lineIdx === 0 ? Math.max(1.5, line.to - line.from) : 1.4))));
  const drift = (t - line.from) * -0.035;
  return [from[0] + (to[0] - from[0]) * f, from[1] + wrap(to[1] - from[1]) * f + drift];
};

/** Projects a lat/lon on the rotated world to screen px. `front` is how much it faces the viewer (−1..1). */
export const project = (ep: OrbitEpisode, t: number, lat: number, lon: number, width: number, height: number, lift = 1.0) => {
  const [rx, ry] = rotationAt(ep, t);
  const dist = distanceAt(ep, t);
  const p = latLonToVec(lat, lon, lift).applyEuler(new THREE.Euler(rx, ry, 0, "XYZ"));
  const tilt = THREE.MathUtils.degToRad(-ep.body.tilt * 0.35);
  p.applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt);
  const cam = new THREE.PerspectiveCamera(FOV, width / height, 0.1, 100);
  cam.position.set(0, 0, dist);
  cam.updateMatrixWorld();
  const front = p.clone().normalize().z;
  const s = p.clone().project(cam);
  return { x: (s.x * 0.5 + 0.5) * width, y: (-s.y * 0.5 + 0.5) * height - LIFT, front };
};

export const zoomIn = (t: number, a: number, b: number) =>
  interpolate(t, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
