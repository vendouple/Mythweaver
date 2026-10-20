"use client";

import * as THREE from "three";
import type { MusicPulse } from "@/lib/client/musicPulse";
import type { ThemeKey, ThemeVisual } from "./themeVisuals";
import {
  TAU,
  canvasTexture,
  clamp01,
  createParticles,
  createTraceRibbon,
  glowSprite,
  lerp,
  mulberry32,
  hashString,
  shaftTexture,
  type ParticleSystem,
  type TraceRibbon,
  type Tracker
} from "./sceneKit";

/* ═══════════════════════════════════════════════════════════════════════════
   LANDMARKS — one hero silhouette per campaign theme, shared by the opening
   and the finale so the two scenes bookend: the Weaving stitches it into
   being; the ending shows what the story did to it.

   Each is built as layered 2.5D cut-outs (extruded polygons) that read as a
   crisp silhouette against the theme's environment and catch a rim light on
   their sides. Every part carries its outline as a THREAD: the opening draws
   those threads on in order (a hot nib riding the head), then fills the
   matter in behind them with a reveal that differs per theme (rising, scanned,
   radiating from the beacon, or dissolving in). Windows light one by one, a
   BEACON (the landmark's heart: a crystal, a lantern, a lighthouse lamp, a
   portal) kindles, and small rigs make it live — a windmill turning, a bell
   swinging, a lantern swaying, gears meshing, a cape in the wind.

     theme         landmark
     ───────────── ───────────────────────────────────────────────
     none          The Threshold — a trilithon around a floating orb
     fantasy       The Wizard's Spire on its crag, a crystal adrift
     scifi         The Orbital Spire — a spinning ring, a docking ship
     horror        The Hangman's Oak — a lantern on a rope, eyes in the bark
     noir          Corner of 5th — neon HOTEL sign, a streetlamp in the rain
     modern        The Relay — lattice comm tower, sweeping searchlight
     western       Last Water — saloon, water tower, a turning windmill
     postapoc      Broadcast Ruin — gutted tower, jury-rigged mast, smoke
     cyberpunk     The Arcology — neon spine, a flickering holo billboard
     spaceopera    Throne of Stars — a citadel with a capital ship overhead
     gothic        The Belfry — a swinging bell, a rose window bleeding red
     urbanfantasy  Ley Gate Alley — a brownstone and a spinning rune portal
     steampunk     The Clockwork Spire — meshing gears, a boiler venting
     pirate        Lighthouse Point — the lamp's beam sweeping the sea
     eastasian     Gate of Pines — torii, a swaying paper lantern, a pine
     superhero     Rooftop Vigil — a caped figure, the signal in the sky
     pulp          The Idol — a stone head with burning eyes, an emerald
     cozy          The Swing Tree — fairy lights, a garden lantern
   ═══════════════════════════════════════════════════════════════════════ */

type Pt = [number, number];
type Poly = Pt[];
type Tone = "body" | "ground" | "glowA" | "glowB" | "glowH" | "glowR";
type LightColor = "warm" | "accent" | "secondary" | "bright" | "red" | "cool";
type LightFlag = "blink" | "flicker" | "twinkle" | "eyes";

type PartSpec = { poly: Poly; holes?: Poly[]; depth?: number; z?: number; tone?: Tone; rig?: number };
type LightSpec = { at: Pt; w?: number; h?: number; color?: LightColor; flag?: LightFlag; rig?: number };
type RigSpec = { kind: "spin" | "sway" | "bob"; pivot: Pt; rate: number; amp?: number; tilt?: number };
type ExtraSpec =
  | { kind: "beam"; from: Pt; angle: number; length: number; width: number; sweep?: number; rate?: number; color: LightColor; cap?: boolean }
  | { kind: "lighthouse"; from: Pt; length: number; width: number; rate: number; color: LightColor }
  | { kind: "smoke"; at: Pt; rate: number; size?: number }
  | { kind: "motes"; at: Pt; radius: number; count: number; color: LightColor; rig?: number };
type GroundKind = "hill" | "crag" | "street" | "dunes" | "rubble" | "shore" | "mound";

type LandmarkSpec = {
  name: string;
  parts: PartSpec[];
  lights: LightSpec[];
  rigs?: RigSpec[];
  extras?: ExtraSpec[];
  beacon: Pt;
  beaconRig?: number;
  beaconSize: number;
  beaconColor: LightColor;
  ground: GroundKind;
  /** Matter reveal: 0 rises, 1 scans down, 2 radiates from the beacon, 3 dissolves in. */
  reveal: 0 | 1 | 2 | 3;
  /** Direction the rim light comes from (x, y). */
  lightDir: Pt;
  windowColor?: LightColor;
};

/* ── polygon helpers ──────────────────────────────────────────────────── */

const rect = (x0: number, y0: number, x1: number, y1: number): Poly => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 22): Poly =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Pt;
  });
const circle = (cx: number, cy: number, r: number, n = 22) => ellipse(cx, cy, r, r, n);
const mirror = (poly: Poly): Poly => poly.map(([x, y]) => [-x, y] as Pt).reverse();
const tf = (poly: Poly, sx: number, sy: number, dx: number, dy: number): Poly => poly.map(([x, y]) => [x * sx + dx, y * sy + dy] as Pt);
const arcBand = (cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, n = 10): Poly => {
  const out: Poly = [];
  for (let i = 0; i <= n; i += 1) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]);
  }
  for (let i = n; i >= 0; i -= 1) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0]);
  }
  return out;
};
/** A ring of `segments` arcs with gaps — so a spin actually reads. */
const brokenRing = (cx: number, cy: number, r0: number, r1: number, segments: number, fill: number): Poly[] =>
  Array.from({ length: segments }, (_, i) => {
    const a0 = (i / segments) * TAU;
    return arcBand(cx, cy, r0, r1, a0, a0 + (TAU / segments) * fill, 8);
  });
const gear = (cx: number, cy: number, r: number, teeth: number, toothDepth = 0.16): Poly => {
  const out: Poly = [];
  const steps = teeth * 4;
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * TAU;
    const tooth = i % 4 === 1 || i % 4 === 2;
    const rr = tooth ? r : r - toothDepth;
    out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return out;
};
/** A pointed (gothic) arch opening from y0 up to its apex. */
const pointedArch = (x0: number, x1: number, y0: number, apex: number): Poly => {
  const cx = (x0 + x1) / 2;
  const half = (x1 - x0) / 2;
  const spring = apex - half * 1.25;
  const out: Poly = [[x0, y0], [x1, y0], [x1, spring]];
  for (let i = 1; i < 6; i += 1) {
    const k = i / 6;
    out.push([lerp(x1, cx, k), spring + (apex - spring) * Math.sin((k * Math.PI) / 2)]);
  }
  out.push([cx, apex]);
  for (let i = 5; i > 0; i -= 1) {
    const k = i / 6;
    out.push([lerp(x0, cx, k), spring + (apex - spring) * Math.sin((k * Math.PI) / 2)]);
  }
  out.push([x0, spring]);
  return out;
};
/** Thin wedge from a hub outward — windmill blades, palm fronds. */
const blade = (cx: number, cy: number, angle: number, r0: number, r1: number, width: number, droop = 0): Poly => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const p = (r: number, w: number, d = 0): Pt => [cx + c * r - s * w, cy + s * r + c * w - d];
  return [p(r0, -width * 0.3), p(r1 * 0.55, -width, droop * 0.3), p(r1, 0, droop), p(r1 * 0.55, width, droop * 0.3), p(r0, width * 0.3)];
};
const grid = (xs: number[], ys: number[], w: number, h: number, extra: Partial<LightSpec> = {}): LightSpec[] =>
  ys.flatMap((y) => xs.map((x) => ({ at: [x, y] as Pt, w, h, ...extra })));
const range = (a: number, b: number, step: number) => {
  const out: number[] = [];
  for (let v = a; v <= b + 1e-6; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
};

/** Lattice holes for a tapering tower (triangles alternating up/down). */
function latticeHoles(cx: number, y0: number, y1: number, hw0: number, hw1: number, levels: number): Poly[] {
  const out: Poly[] = [];
  const hwAt = (y: number) => lerp(hw0, hw1, (y - y0) / (y1 - y0));
  const step = (y1 - y0) / levels;
  for (let i = 0; i < levels; i += 1) {
    const a = y0 + step * i + 0.12;
    const b = y0 + step * (i + 1) - 0.12;
    const wa = hwAt(a) * 0.62;
    const wb = hwAt(b) * 0.62;
    out.push([[cx - wa, a], [cx + wa, a], [cx, b - 0.06]]);
    out.push([[cx - wb + 0.04, b], [cx, a + 0.12], [cx + wb - 0.04, b]].reverse() as Poly);
  }
  return out;
}

const HERO: Poly = [[-0.32, 0], [-0.18, 0], [-0.02, 0.55], [0.02, 0.55], [0.18, 0], [0.32, 0], [0.16, 0.7], [0.2, 1.15], [0.34, 1.1], [0.38, 1.18], [0.18, 1.3], [0.1, 1.32], [0.11, 1.45], [0, 1.56], [-0.11, 1.45], [-0.1, 1.32], [-0.18, 1.3], [-0.38, 1.18], [-0.34, 1.1], [-0.2, 1.15], [-0.16, 0.7]];
const CAPE: Poly = [[-0.17, 1.28], [0.17, 1.28], [0.58, 0.12], [0.12, 0.28], [-0.3, 0.04], [-0.62, 0.2]];

/* ── the eighteen ─────────────────────────────────────────────────────── */

const LANDMARKS: Record<ThemeKey, LandmarkSpec> = {
  none: {
    name: "The Threshold",
    parts: [
      { poly: [[-1.7, 0], [-0.95, 0], [-1.0, 3.5], [-1.65, 3.5]] },
      { poly: mirror([[-1.7, 0], [-0.95, 0], [-1.0, 3.5], [-1.65, 3.5]]) },
      { poly: [[-2.15, 3.5], [2.15, 3.5], [2.0, 4.15], [-2.0, 4.15]] },
      { poly: [[-3.9, 0], [-3.05, 0], [-3.15, 1.9], [-3.7, 2.15]] },
      { poly: [[3.0, 0], [3.85, 0], [3.7, 1.55], [3.15, 1.75]] },
      { poly: [[-5.4, 0], [-4.8, 0], [-4.85, 1.0], [-5.3, 1.15]] },
      { poly: [[4.7, 0], [5.3, 0], [5.25, 0.85], [4.8, 0.95]] },
      { poly: circle(0, 2.05, 0.42), tone: "glowH", rig: 0 }
    ],
    rigs: [{ kind: "bob", pivot: [0, 2.05], rate: 0.9, amp: 0.14 }],
    lights: [
      ...grid([-1.32], [1.0, 1.8, 2.6], 0.09, 0.22, { color: "accent", flag: "twinkle" }),
      ...grid([1.32], [1.4, 2.2, 3.0], 0.09, 0.22, { color: "accent", flag: "twinkle" }),
      ...grid([-1, 0, 1], [3.82], 0.12, 0.16, { color: "accent" })
    ],
    extras: [{ kind: "motes", at: [0, 2.05], radius: 0.95, count: 30, color: "bright", rig: 0 }],
    beacon: [0, 2.05],
    beaconRig: 0,
    beaconSize: 2.6,
    beaconColor: "bright",
    ground: "hill",
    reveal: 2,
    lightDir: [0.6, 0.8]
  },

  fantasy: {
    name: "The Wizard's Spire",
    parts: [
      { poly: [[-3.4, 0], [3.6, 0], [3.0, 0.5], [2.2, 0.9], [1.4, 1.25], [0.8, 1.2], [-0.9, 1.25], [-1.7, 1.0], [-2.5, 0.65], [-3.0, 0.35]], depth: 1.0 },
      { poly: [[-0.72, 1.1], [0.72, 1.1], [0.58, 4.5], [-0.58, 4.5]] },
      { poly: [[-0.92, 3.9], [0.92, 3.9], [0.82, 4.12], [-0.82, 4.12]], depth: 0.8 },
      { poly: [[-0.95, 4.45], [0.95, 4.45], [0.45, 5.0], [0.15, 5.9], [0.05, 6.5], [-0.12, 6.0], [-0.4, 5.1]] },
      { poly: [[0.5, 2.4], [1.32, 2.4], [1.28, 3.5], [0.52, 3.5]], z: 0.1 },
      { poly: [[0.4, 3.48], [1.42, 3.48], [0.9, 4.5]], z: 0.1 },
      { poly: rect(-0.025, 6.3, 0.025, 7.05), depth: 0.1 },
      { poly: [[0.03, 6.98], [0.78, 6.86], [0.6, 6.78], [0.78, 6.68], [0.03, 6.62]], depth: 0.06, rig: 0 },
      { poly: [[-2.2, 4.62], [-1.96, 4.12], [-2.2, 3.52], [-2.44, 4.12]], tone: "glowB", rig: 1 },
      { poly: [[-2.65, 3.15], [-1.75, 3.15], [-2.0, 2.9], [-2.3, 2.75], [-2.5, 2.92]], rig: 1 }
    ],
    rigs: [
      { kind: "sway", pivot: [0.03, 6.8], rate: 2.2, amp: 0.14 },
      { kind: "bob", pivot: [-2.2, 3.6], rate: 0.7, amp: 0.18 }
    ],
    lights: [
      { at: [0, 1.85], w: 0.16, h: 0.34 },
      { at: [0, 2.75], w: 0.16, h: 0.34 },
      { at: [0, 3.55], w: 0.16, h: 0.3 },
      { at: [0.91, 2.95], w: 0.14, h: 0.28 },
      { at: [0, 4.28], w: 0.1, h: 0.1, color: "accent", flag: "twinkle" },
      { at: [-0.35, 1.45], w: 0.12, h: 0.2 }
    ],
    extras: [{ kind: "motes", at: [-2.2, 4.08], radius: 0.75, count: 28, color: "secondary", rig: 1 }],
    beacon: [-2.2, 4.08],
    beaconRig: 1,
    beaconSize: 2.3,
    beaconColor: "secondary",
    ground: "crag",
    reveal: 0,
    lightDir: [-0.7, 0.7]
  },

  scifi: {
    name: "The Orbital Spire",
    parts: [
      { poly: [[-3.2, 0], [3.2, 0], [2.5, 0.55], [-2.5, 0.55]], depth: 1.2 },
      { poly: [[-0.55, 0.55], [0.55, 0.55], [0.32, 4.6], [0.08, 6.3], [-0.08, 6.3], [-0.32, 4.6]] },
      { poly: [[-0.78, 2.2], [0.78, 2.2], [0.62, 2.55], [-0.62, 2.55]], depth: 0.9 },
      { poly: [[-2.1, 0.55], [-1.55, 0.55], [-1.7, 2.9], [-1.95, 2.9]] },
      { poly: mirror([[-2.1, 0.55], [-1.55, 0.55], [-1.7, 2.9], [-1.95, 2.9]]) },
      { poly: [[-2.35, 2.9], [-1.3, 2.9], [-1.5, 3.15], [-2.15, 3.15]] },
      { poly: mirror([[-2.35, 2.9], [-1.3, 2.9], [-1.5, 3.15], [-2.15, 3.15]]) },
      ...brokenRing(0, 3.4, 2.25, 2.42, 6, 0.78).map((poly) => ({ poly, tone: "glowA" as Tone, depth: 0.12, rig: 0 })),
      { poly: [[1.4, 5.2], [3.6, 5.42], [3.8, 5.6], [1.9, 5.75], [1.5, 5.5]], rig: 1, depth: 0.4 }
    ],
    rigs: [
      { kind: "spin", pivot: [0, 3.4], rate: 0.35, tilt: 1.22 },
      { kind: "bob", pivot: [2.6, 5.45], rate: 0.6, amp: 0.16 }
    ],
    lights: [
      ...grid([0], [1.0, 1.6, 3.0, 3.6, 4.2], 0.07, 0.32, { color: "accent" }),
      ...grid([-2.2, -1.1, 1.1, 2.2], [0.28], 0.32, 0.06, { color: "accent", flag: "twinkle" }),
      { at: [1.45, 5.48], w: 0.1, h: 0.16, color: "secondary", rig: 1 },
      ...grid([2.2, 2.6, 3.0], [5.52], 0.08, 0.05, { color: "bright", rig: 1 })
    ],
    extras: [{ kind: "beam", from: [0, 6.3], angle: Math.PI / 2, length: 7, width: 0.35, color: "accent" }],
    beacon: [0, 6.3],
    beaconSize: 1.6,
    beaconColor: "accent",
    ground: "street",
    reveal: 1,
    lightDir: [0.8, 0.6],
    windowColor: "accent"
  },

  horror: {
    name: "The Hangman's Oak",
    parts: [
      { poly: [[-1.2, 0], [1.4, 0], [0.5, 0.3], [-0.4, 0.3]] },
      { poly: [[-0.55, 0], [0.65, 0], [0.4, 1.4], [0.5, 2.5], [1.5, 3.45], [2.7, 3.8], [2.75, 3.92], [1.45, 3.75], [0.55, 3.15], [0.35, 4.4], [0.62, 5.5], [0.46, 5.56], [0.12, 4.6], [-0.15, 3.5], [-1.35, 4.35], [-2.5, 4.5], [-2.55, 4.38], [-1.45, 4.15], [-0.36, 2.95], [-0.32, 1.5]] },
      { poly: [[1.0, 3.3], [1.1, 3.35], [1.3, 4.4], [1.22, 4.42]], depth: 0.2 },
      { poly: [[-1.0, 4.05], [-0.92, 4.1], [-1.3, 5.0], [-1.38, 4.96]], depth: 0.2 },
      { poly: [[2.2, 3.7], [2.28, 3.72], [2.6, 4.3], [2.54, 4.34]], depth: 0.2 },
      { poly: rect(2.18, 2.75, 2.22, 3.74), depth: 0.05, rig: 0 },
      { poly: [[2.05, 2.35], [2.35, 2.35], [2.42, 2.75], [1.98, 2.75]], depth: 0.3, rig: 0 },
      { poly: [[-3.4, 0], [-2.7, 0], [-2.72, 0.95], [-2.85, 1.1], [-3.05, 1.15], [-3.25, 1.1], [-3.38, 0.95]] },
      { poly: [[2.9, 0], [3.5, 0], [3.6, 0.85], [3.45, 1.0], [3.2, 1.02], [3.05, 0.9]] },
      { poly: [[-4.6, 0], [-4.45, 0], [-4.45, 0.85], [-4.2, 0.85], [-4.2, 0.98], [-4.45, 0.98], [-4.45, 1.3], [-4.6, 1.3], [-4.6, 0.98], [-4.85, 0.98], [-4.85, 0.85], [-4.6, 0.85]], depth: 0.2 }
    ],
    rigs: [{ kind: "sway", pivot: [2.2, 3.74], rate: 1.1, amp: 0.09 }],
    lights: [
      { at: [2.2, 2.55], w: 0.2, h: 0.26, color: "accent", flag: "flicker", rig: 0 },
      { at: [-0.04, 2.1], w: 0.08, h: 0.05, color: "red", flag: "eyes" },
      { at: [0.2, 2.12], w: 0.08, h: 0.05, color: "red", flag: "eyes" }
    ],
    beacon: [2.2, 2.55],
    beaconRig: 0,
    beaconSize: 1.8,
    beaconColor: "accent",
    ground: "hill",
    reveal: 3,
    lightDir: [-0.5, 0.85]
  },

  noir: {
    name: "Corner of 5th",
    parts: [
      { poly: [[-4.6, 0], [-1.7, 0], [-1.7, 5.0], [-1.55, 5.0], [-1.55, 5.2], [-4.75, 5.2], [-4.75, 5.0], [-4.6, 5.0]] },
      { poly: [[-4.0, 5.2], [-3.0, 5.2], [-3.0, 6.0], [-3.5, 6.3], [-4.0, 6.0]] },
      { poly: rect(-1.7, 1.6, -1.12, 1.68), depth: 0.7 },
      { poly: rect(-1.7, 2.8, -1.12, 2.88), depth: 0.7 },
      { poly: rect(-1.7, 4.0, -1.12, 4.08), depth: 0.7 },
      { poly: rect(-1.18, 1.6, -1.12, 4.08), depth: 0.7 },
      { poly: rect(-1.55, 3.3, -1.12, 3.38), depth: 0.2 },
      { poly: rect(-1.1, 2.2, -0.8, 4.6), tone: "glowR", depth: 0.16 },
      { poly: rect(1.52, 0, 1.66, 4.15), depth: 0.14 },
      { poly: [[1.4, 0], [1.78, 0], [1.7, 0.35], [1.48, 0.35]], depth: 0.3 },
      { poly: [[1.52, 4.05], [2.62, 4.22], [2.62, 4.34], [1.52, 4.2]], depth: 0.1 },
      { poly: [[2.3, 4.3], [2.92, 4.3], [2.78, 4.06], [2.44, 4.06]], depth: 0.4 },
      { poly: [[3.2, 0], [3.5, 0], [3.48, 0.45], [3.35, 0.55], [3.22, 0.45]], depth: 0.3 },
      { poly: rect(3.9, 0, 5.8, 3.3) },
      { poly: rect(3.8, 3.3, 5.9, 3.45) }
    ],
    lights: [
      ...grid([-4.15, -3.55, -2.95, -2.35], [0.9, 1.9, 2.9, 3.9], 0.3, 0.42),
      ...grid([4.3, 5.0], [1.2, 2.3], 0.34, 0.46),
      { at: [2.61, 4.12], w: 0.36, h: 0.06, color: "bright" }
    ],
    extras: [{ kind: "beam", from: [2.61, 4.04], angle: -Math.PI / 2, length: 4.3, width: 2.4, color: "warm" }],
    beacon: [2.61, 4.02],
    beaconSize: 2.0,
    beaconColor: "warm",
    ground: "street",
    reveal: 1,
    lightDir: [0.8, 0.35]
  },

  modern: {
    name: "The Relay",
    parts: [
      { poly: [[-4.2, 0], [0.4, 0], [0.4, 2.7], [-0.6, 2.7], [-0.6, 3.0], [-2.4, 3.0], [-2.4, 2.7], [-4.2, 2.7]] },
      { poly: rect(-3.42, 2.7, -3.3, 3.3), depth: 0.12 },
      { poly: [[-3.8, 3.25], [-2.95, 3.85], [-2.85, 3.7], [-3.62, 3.1]], depth: 0.2 },
      { poly: [[1.0, 0], [2.8, 0], [2.05, 6.0], [1.75, 6.0]], holes: latticeHoles(1.9, 0.1, 5.7, 0.86, 0.2, 5), depth: 0.3 },
      { poly: rect(1.88, 6.0, 1.92, 6.85), depth: 0.06 }
    ],
    lights: [
      ...grid([-3.8, -3.2, -2.6, -2.0, -1.4, -0.8, -0.2], [0.6, 1.3, 2.0], 0.36, 0.28, { color: "cool" }),
      ...grid([1.9], [2.0, 4.0, 6.85], 0.1, 0.1, { color: "red", flag: "blink" })
    ],
    extras: [{ kind: "beam", from: [-1.5, 3.0], angle: 1.95, length: 10, width: 0.7, sweep: 0.55, rate: 0.35, color: "bright" }],
    beacon: [1.9, 6.85],
    beaconSize: 1.3,
    beaconColor: "red",
    ground: "street",
    reveal: 1,
    lightDir: [0.7, 0.7],
    windowColor: "cool"
  },

  western: {
    name: "Last Water",
    parts: [
      { poly: [[-4.6, 0], [-1.6, 0], [-1.6, 2.2], [-1.8, 2.2], [-1.8, 2.65], [-2.6, 2.65], [-2.8, 2.85], [-3.4, 2.85], [-3.6, 2.65], [-4.4, 2.65], [-4.4, 2.2], [-4.6, 2.2]] },
      { poly: rect(-4.75, 1.45, -1.45, 1.58), depth: 0.9 },
      { poly: rect(-4.68, 0, -4.58, 1.45), depth: 0.9, z: 0.15 },
      { poly: rect(-1.6, 0, -1.5, 1.45), depth: 0.9, z: 0.15 },
      { poly: [[0.25, 0], [0.4, 0], [0.75, 2.6], [0.62, 2.6]], depth: 0.2 },
      { poly: [[1.85, 0], [2.0, 0], [1.68, 2.6], [1.55, 2.6]], depth: 0.2 },
      { poly: rect(0.42, 1.1, 1.85, 1.18), depth: 0.12 },
      { poly: rect(0.4, 2.6, 1.85, 3.75) },
      { poly: [[0.3, 3.75], [1.95, 3.75], [1.125, 4.35]] },
      { poly: [[3.3, 0], [3.55, 0], [3.47, 4.6], [3.38, 4.6]], depth: 0.15 },
      { poly: [[3.43, 4.62], [4.4, 4.75], [4.45, 5.0], [3.43, 4.72]], depth: 0.08 },
      ...Array.from({ length: 8 }, (_, i) => ({ poly: blade(3.43, 4.68, (i / 8) * TAU, 0.12, 1.05, 0.11), depth: 0.06, z: 0.12, rig: 0 })),
      { poly: [[-0.75, 0], [-0.5, 0], [-0.5, 0.75], [-0.25, 0.85], [-0.25, 1.25], [-0.36, 1.25], [-0.36, 0.98], [-0.5, 0.95], [-0.5, 1.6], [-0.62, 1.72], [-0.75, 1.6], [-0.75, 1.05], [-0.9, 1.0], [-0.9, 1.35], [-1.01, 1.35], [-1.01, 0.88], [-0.75, 0.8]], depth: 0.3 }
    ],
    rigs: [{ kind: "spin", pivot: [3.43, 4.68], rate: -0.9 }],
    lights: [
      { at: [-4.05, 0.85], w: 0.45, h: 0.45, flag: "flicker" },
      { at: [-2.15, 0.85], w: 0.45, h: 0.45 },
      { at: [-3.1, 0.55], w: 0.42, h: 0.75 },
      { at: [-3.1, 2.05], w: 0.5, h: 0.35 }
    ],
    beacon: [-1.72, 1.22],
    beaconSize: 1.5,
    beaconColor: "warm",
    ground: "dunes",
    reveal: 0,
    lightDir: [0.9, 0.4]
  },

  postapoc: {
    name: "Broadcast Ruin",
    parts: [
      {
        poly: [[-3.4, 0], [-0.9, 0], [-0.9, 3.1], [-1.15, 3.5], [-1.45, 3.05], [-1.8, 4.3], [-2.05, 4.0], [-2.4, 4.6], [-2.75, 3.9], [-3.05, 4.15], [-3.4, 3.3]],
        holes: [
          rect(-3.15, 0.5, -2.8, 1.0), rect(-2.6, 0.5, -2.25, 1.0), rect(-2.05, 0.5, -1.7, 1.0), rect(-1.5, 0.5, -1.15, 1.0),
          rect(-3.15, 1.4, -2.8, 1.9), rect(-2.05, 1.4, -1.7, 1.9), rect(-1.5, 1.4, -1.15, 1.9),
          rect(-2.6, 2.3, -2.25, 2.8), rect(-3.15, 2.3, -2.8, 2.8)
        ]
      },
      { poly: [[-2.42, 4.5], [-2.38, 4.5], [-2.2, 5.1], [-2.25, 5.12]], depth: 0.06 },
      { poly: [[-1.85, 4.2], [-1.8, 4.2], [-1.6, 4.75], [-1.66, 4.76]], depth: 0.06 },
      { poly: rect(1.33, 0, 1.47, 5.0), depth: 0.14 },
      { poly: rect(0.95, 3.6, 1.85, 3.67), depth: 0.1 },
      { poly: rect(1.05, 4.4, 1.75, 4.46), depth: 0.1 },
      { poly: [[1.47, 2.6], [2.1, 2.95], [2.0, 3.15], [1.47, 2.85]], depth: 0.2 },
      { poly: [[1.4, 4.95], [1.43, 4.95], [3.2, 0], [3.14, 0]], depth: 0.03 },
      { poly: [[1.37, 4.95], [1.4, 4.95], [-0.4, 0], [-0.46, 0]], depth: 0.03 },
      { poly: [[2.4, 0], [4.4, 0], [4.45, 0.5], [3.95, 0.55], [3.6, 0.95], [2.95, 0.95], [2.65, 0.55], [2.35, 0.5]], depth: 0.8 },
      { poly: rect(0.2, 0, 0.6, 0.55), depth: 0.4 }
    ],
    lights: [
      { at: [0.4, 0.68], w: 0.32, h: 0.22, color: "accent", flag: "flicker" },
      { at: [1.4, 5.05], w: 0.1, h: 0.1, color: "secondary", flag: "blink" },
      { at: [3.25, 0.72], w: 0.42, h: 0.18, color: "accent", flag: "flicker" }
    ],
    extras: [
      { kind: "smoke", at: [-2.05, 4.45], rate: 1.1, size: 0.9 },
      { kind: "smoke", at: [0.4, 0.75], rate: 0.6, size: 0.5 }
    ],
    beacon: [1.4, 5.05],
    beaconSize: 1.6,
    beaconColor: "secondary",
    ground: "rubble",
    reveal: 3,
    lightDir: [0.6, 0.7]
  },

  cyberpunk: {
    name: "The Arcology",
    parts: [
      { poly: [[-1.4, 0], [1.4, 0], [1.4, 3.0], [1.0, 3.0], [1.0, 5.0], [0.62, 5.0], [0.62, 6.1], [-0.62, 6.1], [-0.62, 5.0], [-1.0, 5.0], [-1.0, 3.0], [-1.4, 3.0]] },
      { poly: rect(-0.03, 6.1, 0.03, 7.0), depth: 0.06 },
      { poly: [[-3.9, 0], [-2.3, 0], [-2.3, 3.9], [-2.6, 4.3], [-3.6, 4.3], [-3.9, 3.9]], z: -0.3 },
      { poly: rect(2.3, 0, 3.7, 4.6), z: -0.3 },
      { poly: rect(2.9, 4.6, 3.0, 5.4), depth: 0.1, z: -0.3 },
      { poly: rect(-5.6, 0, -4.3, 2.6), z: -0.6 },
      { poly: rect(4.2, 0, 5.6, 3.0), z: -0.6 },
      { poly: rect(-2.3, 2.4, -1.4, 2.55), depth: 0.4 },
      { poly: rect(1.42, 1.2, 1.68, 4.0), tone: "glowA", depth: 0.14 },
      { poly: rect(-3.7, 4.6, -1.6, 5.45), tone: "glowB", depth: 0.04, rig: 0 }
    ],
    rigs: [{ kind: "bob", pivot: [-2.65, 5.0], rate: 0.8, amp: 0.06 }],
    lights: [
      ...grid([-0.9, -0.3, 0.3, 0.9], [0.5, 1.1, 1.7, 2.3], 0.26, 0.12, { color: "accent" }),
      ...grid([-0.6, 0, 0.6], [3.3, 3.75, 4.2, 4.65], 0.22, 0.1, { color: "secondary" }),
      ...grid([-3.5, -2.9], [0.6, 1.15, 1.7, 2.25, 2.8, 3.35], 0.3, 0.12, { color: "secondary", flag: "twinkle" }),
      ...grid([2.65, 3.3], [0.6, 1.2, 1.8, 2.4, 3.0, 3.6, 4.2], 0.3, 0.12, { color: "accent", flag: "twinkle" })
    ],
    extras: [
      { kind: "beam", from: [-3.0, 4.3], angle: 1.4, length: 11, width: 0.6, sweep: 0.4, rate: 0.5, color: "secondary" },
      { kind: "beam", from: [3.0, 5.4], angle: 1.78, length: 11, width: 0.6, sweep: 0.45, rate: 0.37, color: "accent" }
    ],
    beacon: [0, 7.0],
    beaconSize: 1.2,
    beaconColor: "accent",
    ground: "street",
    reveal: 1,
    lightDir: [0.7, 0.6]
  },

  spaceopera: {
    name: "Throne of Stars",
    parts: [
      { poly: [[-3.8, 0], [3.8, 0], [3.1, 0.6], [2.3, 0.95], [-2.2, 0.95], [-3.0, 0.6]], depth: 1.2 },
      { poly: [[-2.5, 0.9], [2.5, 0.9], [2.1, 2.2], [-2.1, 2.2]] },
      { poly: [[-0.45, 2.1], [0.45, 2.1], [0.28, 5.0], [0, 6.5], [-0.28, 5.0]] },
      { poly: [[-1.6, 2.1], [-0.9, 2.1], [-1.05, 3.9], [-1.25, 4.6], [-1.45, 3.9]] },
      { poly: mirror([[-1.6, 2.1], [-0.9, 2.1], [-1.05, 3.9], [-1.25, 4.6], [-1.45, 3.9]]) },
      { poly: [[-1.05, 3.1], [-0.4, 3.6], [-0.4, 3.75], [-1.08, 3.3]], depth: 0.2 },
      { poly: mirror([[-1.05, 3.1], [-0.4, 3.6], [-0.4, 3.75], [-1.08, 3.3]]), depth: 0.2 },
      { poly: [[-5.0, 5.0], [-1.8, 5.35], [-1.3, 5.55], [-1.9, 5.85], [-4.6, 5.75], [-5.1, 5.4]], depth: 0.5, rig: 0 },
      { poly: [[-4.2, 5.75], [-3.4, 5.75], [-3.6, 6.05], [-4.0, 6.05]], depth: 0.3, rig: 0 }
    ],
    rigs: [{ kind: "bob", pivot: [-3.2, 5.45], rate: 0.4, amp: 0.18 }],
    lights: [
      ...grid(range(-1.8, 1.8, 0.45), [1.45], 0.14, 0.4),
      ...grid([0], [3.0, 3.8, 4.5], 0.1, 0.24, { color: "bright" }),
      ...grid([-5.06], [5.22, 5.55], 0.12, 0.2, { color: "secondary", rig: 0 }),
      ...grid(range(-4.4, -2.2, 0.4), [5.5], 0.07, 0.05, { color: "bright", rig: 0, flag: "twinkle" })
    ],
    extras: [{ kind: "beam", from: [0, 6.5], angle: Math.PI / 2, length: 9, width: 0.3, color: "accent" }],
    beacon: [0, 6.5],
    beaconSize: 2.4,
    beaconColor: "accent",
    ground: "crag",
    reveal: 2,
    lightDir: [0.5, 0.85]
  },

  gothic: {
    name: "The Belfry",
    parts: [
      { poly: rect(-0.95, 0, 0.95, 4.3), holes: [pointedArch(-0.55, 0.55, 3.05, 4.0)] },
      { poly: [[-1.1, 4.25], [1.1, 4.25], [0, 6.8]] },
      { poly: [[-1.12, 4.25], [-0.82, 4.25], [-0.97, 5.1]], z: 0.2, depth: 0.2 },
      { poly: [[0.82, 4.25], [1.12, 4.25], [0.97, 5.1]], z: 0.2, depth: 0.2 },
      { poly: [[-0.32, 3.15], [0.32, 3.15], [0.24, 3.4], [0.16, 3.72], [0, 3.8], [-0.16, 3.72], [-0.24, 3.4]], depth: 0.35, rig: 0 },
      { poly: [[-4.4, 0], [-0.95, 0], [-0.95, 2.3], [-2.675, 3.4], [-4.4, 2.3]], z: -0.2 },
      { poly: [[-4.8, 0], [-4.4, 0], [-4.4, 2.3], [-4.65, 2.05]], z: -0.2 },
      { poly: [[0.95, 3.95], [1.45, 4.1], [1.52, 4.3], [0.95, 4.3]], depth: 0.3 },
      { poly: rect(1.5, 0.48, 4.9, 0.54), depth: 0.06 },
      { poly: rect(1.5, 1.12, 4.9, 1.18), depth: 0.06 },
      ...range(1.65, 4.8, 0.35).map((x) => ({ poly: [[x - 0.03, 0], [x + 0.03, 0], [x + 0.03, 1.35], [x, 1.5], [x - 0.03, 1.35]] as Poly, depth: 0.06 }))
    ],
    rigs: [{ kind: "sway", pivot: [0, 3.88], rate: 1.6, amp: 0.32 }],
    lights: [
      { at: [-2.675, 2.15], w: 0.72, h: 0.72, color: "accent", flag: "flicker" },
      { at: [-3.7, 1.2], w: 0.26, h: 0.82, color: "accent" },
      { at: [-1.65, 1.2], w: 0.26, h: 0.82, color: "accent" },
      { at: [0, 1.8], w: 0.28, h: 0.9, color: "accent", flag: "flicker" }
    ],
    beacon: [0, 3.45],
    beaconSize: 1.9,
    beaconColor: "accent",
    ground: "hill",
    reveal: 3,
    lightDir: [-0.6, 0.8]
  },

  urbanfantasy: {
    name: "Ley Gate Alley",
    parts: [
      { poly: [[-4.6, 0], [-1.4, 0], [-1.4, 4.3], [-1.3, 4.3], [-1.3, 4.5], [-4.7, 4.5], [-4.7, 4.3], [-4.6, 4.3]] },
      { poly: rect(-3.5, 0, -2.5, 0.5), depth: 0.9 },
      { poly: rect(-1.4, 1.8, -0.9, 1.86), depth: 0.7 },
      { poly: rect(-1.4, 3.0, -0.9, 3.06), depth: 0.7 },
      { poly: rect(-0.95, 1.8, -0.9, 3.06), depth: 0.7 },
      { poly: rect(-0.35, 0, -0.25, 3.4), depth: 0.1 },
      { poly: [[-0.5, 3.4], [-0.1, 3.4], [-0.2, 3.7], [-0.4, 3.7]], depth: 0.3 },
      { poly: rect(0.6, 0, 1.0, 0.6), depth: 0.4 },
      { poly: rect(4.4, 0, 6.0, 5.2), z: -0.4 },
      ...brokenRing(2.3, 2.15, 1.45, 1.62, 8, 0.82).map((poly) => ({ poly, tone: "glowA" as Tone, depth: 0.08, rig: 0 })),
      ...brokenRing(2.3, 2.15, 1.12, 1.2, 5, 0.7).map((poly) => ({ poly, tone: "glowB" as Tone, depth: 0.06, rig: 1 }))
    ],
    rigs: [
      { kind: "spin", pivot: [2.3, 2.15], rate: 0.3 },
      { kind: "spin", pivot: [2.3, 2.15], rate: -0.55 }
    ],
    lights: [
      ...grid([-4.1, -3.4, -2.7, -2.0], [1.2, 2.3, 3.4], 0.4, 0.55),
      { at: [-0.3, 3.45], w: 0.24, h: 0.12, color: "bright" }
    ],
    extras: [{ kind: "motes", at: [2.3, 2.15], radius: 1.25, count: 44, color: "accent" }],
    beacon: [2.3, 2.15],
    beaconSize: 3.0,
    beaconColor: "accent",
    ground: "street",
    reveal: 2,
    lightDir: [0.8, 0.5]
  },

  steampunk: {
    name: "The Clockwork Spire",
    parts: [
      { poly: [[-1.05, 0], [1.05, 0], [0.95, 4.6], [-0.95, 4.6]] },
      { poly: [[-1.2, 4.55], [1.2, 4.55], [0.85, 5.1], [0, 6.0], [-0.85, 5.1]] },
      { poly: rect(-0.03, 6.0, 0.03, 6.6), depth: 0.06 },
      { poly: circle(0, 3.55, 0.72, 28), tone: "glowA", depth: 0.08, z: 0.3 },
      { poly: rect(-0.035, 3.55, 0.035, 4.15), depth: 0.04, z: 0.4, rig: 0 },
      { poly: rect(-0.05, 3.55, 0.05, 3.95), depth: 0.04, z: 0.42, rig: 1 },
      { poly: gear(-2.7, 2.3, 1.25, 14), holes: [circle(-2.7, 2.3, 0.36, 14)], depth: 0.3, rig: 2 },
      { poly: gear(-1.9, 3.95, 0.62, 9, 0.13), holes: [circle(-1.9, 3.95, 0.18, 10)], depth: 0.3, z: 0.2, rig: 3 },
      { poly: [[1.1, 0], [3.4, 0], [3.4, 1.6], [3.1, 1.95], [1.4, 1.95], [1.1, 1.6]] },
      { poly: rect(2.6, 1.9, 2.95, 4.0) },
      { poly: rect(2.5, 4.0, 3.05, 4.15) },
      { poly: rect(1.0, 1.2, 1.5, 1.32), depth: 0.3 }
    ],
    rigs: [
      { kind: "spin", pivot: [0, 3.55], rate: -0.5 },
      { kind: "spin", pivot: [0, 3.55], rate: -0.04 },
      { kind: "spin", pivot: [-2.7, 2.3], rate: 0.35 },
      { kind: "spin", pivot: [-1.9, 3.95], rate: -0.35 * (1.25 / 0.62) }
    ],
    lights: [
      { at: [0, 1.2], w: 0.3, h: 0.5 },
      { at: [0, 2.2], w: 0.3, h: 0.5 },
      { at: [2.25, 0.6], w: 0.7, h: 0.34, color: "accent", flag: "flicker" },
      { at: [1.7, 1.3], w: 0.18, h: 0.18, color: "secondary", flag: "twinkle" }
    ],
    extras: [{ kind: "smoke", at: [2.78, 4.2], rate: 1.4, size: 0.8 }],
    beacon: [0, 3.55],
    beaconSize: 2.4,
    beaconColor: "accent",
    ground: "street",
    reveal: 0,
    lightDir: [0.7, 0.6]
  },

  pirate: {
    name: "Lighthouse Point",
    parts: [
      { poly: [[-4.4, 0], [4.0, 0], [3.2, 0.5], [2.0, 0.9], [0.9, 1.05], [-0.9, 1.0], [-2.2, 0.75], [-3.4, 0.4]], depth: 1.2 },
      { poly: [[-0.72, 0.95], [0.72, 0.95], [0.46, 4.6], [-0.46, 4.6]] },
      { poly: rect(-0.68, 4.55, 0.68, 4.72), depth: 0.8 },
      { poly: rect(-0.38, 4.72, -0.3, 5.4), depth: 0.4 },
      { poly: rect(0.3, 4.72, 0.38, 5.4), depth: 0.4 },
      { poly: [[-0.5, 5.38], [0.5, 5.38], [0.12, 5.85], [0, 6.05], [-0.12, 5.85]] },
      { poly: [[-3.3, 0.5], [-1.7, 0.5], [-1.7, 1.5], [-2.5, 2.1], [-3.3, 1.5]], z: -0.2 },
      { poly: rect(-2.0, 1.6, -1.82, 2.1), z: -0.2, depth: 0.2 }
    ],
    lights: [
      { at: [0, 5.06], w: 0.6, h: 0.62, color: "bright" },
      { at: [0, 2.2], w: 0.14, h: 0.26 },
      { at: [0, 3.4], w: 0.14, h: 0.26 },
      { at: [-2.5, 1.0], w: 0.32, h: 0.3, flag: "flicker" }
    ],
    extras: [
      { kind: "lighthouse", from: [0, 5.06], length: 13, width: 1.1, rate: 0.55, color: "bright" },
      { kind: "smoke", at: [-1.91, 2.15], rate: 0.5, size: 0.45 }
    ],
    beacon: [0, 5.06],
    beaconSize: 2.6,
    beaconColor: "bright",
    ground: "shore",
    reveal: 0,
    lightDir: [-0.6, 0.7]
  },

  eastasian: {
    name: "Gate of Pines",
    parts: [
      { poly: [[-2.25, 0], [-1.9, 0], [-1.95, 3.3], [-2.2, 3.3]] },
      { poly: [[1.1, 0], [1.45, 0], [1.4, 3.3], [1.15, 3.3]] },
      { poly: rect(-2.6, 2.65, 1.8, 2.9), depth: 0.5 },
      { poly: [[-2.95, 3.62], [-2.55, 3.3], [1.75, 3.3], [2.15, 3.62], [2.3, 3.82], [1.8, 3.66], [-2.6, 3.66], [-3.1, 3.82]], depth: 0.6 },
      { poly: rect(-0.48, 2.9, -0.32, 3.3), depth: 0.3 },
      { poly: rect(-0.42, 2.12, -0.38, 2.66), depth: 0.04, rig: 0 },
      { poly: [[-0.62, 1.55], [-0.18, 1.55], [-0.1, 1.85], [-0.18, 2.12], [-0.62, 2.12], [-0.7, 1.85]], depth: 0.3, rig: 0 },
      { poly: [[-4.35, 0], [-3.65, 0], [-3.75, 0.25], [-4.25, 0.25]] },
      { poly: rect(-4.12, 0.25, -3.88, 1.0) },
      { poly: rect(-4.25, 1.0, -3.75, 1.45), holes: [rect(-4.12, 1.1, -3.88, 1.35)] },
      { poly: [[-4.55, 1.45], [-3.45, 1.45], [-3.85, 1.75], [-4.0, 1.95], [-4.15, 1.75]] },
      { poly: [[3.0, 0], [3.35, 0], [3.2, 1.2], [3.6, 2.4], [4.2, 3.1], [4.1, 3.2], [3.45, 2.6], [3.0, 1.4]], depth: 0.4 },
      { poly: [[3.3, 2.2], [2.7, 3.5], [2.8, 3.55], [3.4, 2.35]], depth: 0.2 },
      { poly: ellipse(4.3, 3.25, 1.1, 0.32), depth: 0.5 },
      { poly: ellipse(3.35, 2.55, 0.85, 0.27), depth: 0.5 },
      { poly: ellipse(2.75, 3.62, 0.8, 0.26), depth: 0.5 }
    ],
    rigs: [{ kind: "sway", pivot: [-0.4, 2.66], rate: 1.0, amp: 0.1 }],
    lights: [
      { at: [-0.4, 1.83], w: 0.42, h: 0.46, color: "accent", rig: 0 },
      { at: [-4.0, 1.22], w: 0.22, h: 0.2, flag: "flicker" }
    ],
    beacon: [-0.4, 1.83],
    beaconRig: 0,
    beaconSize: 2.0,
    beaconColor: "accent",
    ground: "hill",
    reveal: 3,
    lightDir: [0.6, 0.75]
  },

  superhero: {
    name: "Rooftop Vigil",
    parts: [
      { poly: rect(-1.4, 0, 1.4, 2.5) },
      { poly: rect(-1.55, 2.45, 1.55, 2.62), depth: 0.8 },
      { poly: tf(HERO, 1.25, 1.25, 0, 2.62), depth: 0.3, z: 0.05 },
      { poly: tf(CAPE, 1.25, 1.25, 0, 2.62), depth: 0.1, z: -0.12, rig: 0 },
      { poly: rect(-4.6, 0, -2.0, 3.6), z: -0.3 },
      { poly: rect(-3.85, 3.6, -3.75, 3.85), z: -0.3, depth: 0.1 },
      { poly: rect(-3.15, 3.6, -3.05, 3.85), z: -0.3, depth: 0.1 },
      { poly: rect(-3.95, 3.85, -2.95, 4.6), z: -0.3 },
      { poly: [[-4.05, 4.6], [-2.85, 4.6], [-3.45, 5.0]], z: -0.3 },
      { poly: rect(2.0, 0, 4.8, 2.0), z: -0.3 },
      { poly: [[2.6, 2.0], [3.4, 2.0], [3.3, 2.3], [2.7, 2.3]], depth: 0.4 },
      { poly: [[2.8, 2.25], [3.2, 2.25], [3.62, 3.0], [3.18, 3.2]], depth: 0.45 }
    ],
    rigs: [{ kind: "sway", pivot: [0, 2.62 + 1.28 * 1.25], rate: 1.3, amp: 0.1 }],
    lights: [
      ...grid([-4.2, -3.6, -3.0, -2.4], [0.6, 1.4, 2.2, 3.0], 0.3, 0.42),
      ...grid([2.4, 3.1, 3.8, 4.4], [0.5, 1.25], 0.34, 0.4),
      { at: [0, 0.55], w: 0.4, h: 0.8, color: "cool" }
    ],
    extras: [{ kind: "beam", from: [3.4, 3.1], angle: 1.15, length: 11, width: 1.1, sweep: 0.06, rate: 0.3, color: "bright", cap: true }],
    beacon: [3.4, 3.1],
    beaconSize: 1.8,
    beaconColor: "bright",
    ground: "street",
    reveal: 0,
    lightDir: [-0.7, 0.6]
  },

  pulp: {
    name: "The Idol",
    parts: [
      { poly: [[-1.9, 0], [1.9, 0], [1.75, 0.4], [-1.75, 0.4]], depth: 1.0 },
      { poly: [[-1.35, 0.35], [1.35, 0.35], [1.45, 2.5], [1.25, 3.4], [0.85, 3.95], [0.3, 4.15], [-0.3, 4.15], [-0.85, 3.95], [-1.25, 3.4], [-1.45, 2.5]], depth: 0.9 },
      { poly: [[-1.62, 1.6], [-1.4, 1.5], [-1.4, 2.7], [-1.62, 2.6]], depth: 0.6 },
      { poly: mirror([[-1.62, 1.6], [-1.4, 1.5], [-1.4, 2.7], [-1.62, 2.6]]), depth: 0.6 },
      { poly: rect(-3.6, 0, -3.0, 2.9) },
      { poly: rect(-3.75, 2.9, -2.85, 3.15) },
      { poly: [[2.9, 0], [3.5, 0], [3.5, 1.6], [3.3, 1.9], [3.15, 1.65], [2.9, 1.8]] },
      { poly: rect(3.8, 0, 4.7, 0.45), depth: 0.7 },
      { poly: [[-3.4, 2.9], [-3.35, 2.9], [-3.25, 1.6], [-3.3, 1.58]], depth: 0.05, z: 0.32 },
      { poly: [[-3.1, 2.9], [-3.05, 2.9], [-3.15, 2.1], [-3.2, 2.1]], depth: 0.05, z: 0.32 },
      { poly: [[4.6, 0], [4.85, 0], [4.75, 1.5], [4.35, 3.1], [4.2, 3.05], [4.55, 1.5]], depth: 0.25 },
      ...[0.3, 1.0, 1.9, 2.6, 3.4].map((a) => ({ poly: blade(4.28, 3.1, a, 0.05, 1.25, 0.18, 0.35), depth: 0.05, rig: 0 }))
    ],
    rigs: [{ kind: "sway", pivot: [4.28, 3.1], rate: 0.8, amp: 0.06 }],
    lights: [
      { at: [-0.5, 2.55], w: 0.36, h: 0.14, color: "accent" },
      { at: [0.5, 2.55], w: 0.36, h: 0.14, color: "accent" },
      { at: [-3.3, 3.42], w: 0.16, h: 0.28, color: "warm", flag: "flicker" },
      { at: [3.2, 2.12], w: 0.16, h: 0.28, color: "warm", flag: "flicker" }
    ],
    beacon: [0, 3.45],
    beaconSize: 1.8,
    beaconColor: "secondary",
    ground: "mound",
    reveal: 0,
    lightDir: [0.7, 0.6]
  },

  cozy: {
    name: "The Swing Tree",
    parts: [
      { poly: [[-1.0, 0], [0.2, 0], [-0.05, 1.5], [0.1, 2.4], [0.7, 3.0], [0.62, 3.12], [-0.12, 2.75], [-0.45, 3.2], [-0.58, 3.1], [-0.38, 2.4], [-0.55, 1.3]] },
      { poly: [[0.5, 2.85], [2.1, 3.1], [2.1, 3.22], [0.45, 3.0]], depth: 0.25 },
      { poly: circle(-0.4, 3.75, 1.35, 26), depth: 0.8, z: -0.2 },
      { poly: circle(0.85, 3.5, 1.0, 22), depth: 0.8, z: -0.25 },
      { poly: circle(-1.65, 3.35, 0.95, 22), depth: 0.8, z: -0.25 },
      { poly: circle(0.3, 4.6, 1.0, 22), depth: 0.8, z: -0.3 },
      { poly: circle(-1.15, 4.5, 0.9, 22), depth: 0.8, z: -0.3 },
      { poly: rect(1.55, 1.1, 1.58, 3.12), depth: 0.03, rig: 0 },
      { poly: rect(2.0, 1.1, 2.03, 3.14), depth: 0.03, rig: 0 },
      { poly: rect(1.45, 1.03, 2.13, 1.14), depth: 0.3, rig: 0 },
      ...range(2.85, 5.25, 0.6).map((x) => ({ poly: [[x - 0.06, 0], [x + 0.06, 0], [x + 0.06, 0.88], [x, 0.98], [x - 0.06, 0.88]] as Poly, depth: 0.1 })),
      { poly: rect(2.6, 0.35, 5.4, 0.42), depth: 0.08 },
      { poly: rect(2.6, 0.68, 5.4, 0.75), depth: 0.08 },
      { poly: rect(-3.4, 0, -3.3, 2.2), depth: 0.1 },
      { poly: [[-3.55, 2.2], [-3.15, 2.2], [-3.2, 2.6], [-3.5, 2.6]], depth: 0.3, holes: [rect(-3.45, 2.27, -3.25, 2.53)] },
      { poly: [[-3.6, 2.6], [-3.1, 2.6], [-3.35, 2.85]], depth: 0.3 },
      { poly: rect(-2.4, 0, -2.33, 0.9), depth: 0.08 },
      { poly: [[-2.6, 0.9], [-2.1, 0.9], [-2.1, 1.15], [-2.35, 1.25], [-2.6, 1.15]], depth: 0.3 }
    ],
    rigs: [{ kind: "sway", pivot: [1.8, 3.13], rate: 0.9, amp: 0.13 }],
    lights: [
      ...Array.from({ length: 12 }, (_, k) => {
        const u = k / 11;
        return { at: [lerp(-1.9, 1.3, u), 3.05 - Math.sin(u * Math.PI) * 0.35] as Pt, w: 0.08, h: 0.08, flag: "twinkle" as LightFlag };
      }),
      ...Array.from({ length: 9 }, (_, k) => {
        const u = k / 8;
        return { at: [lerp(-1.3, 0.9, u), 4.25 - Math.sin(u * Math.PI) * 0.28] as Pt, w: 0.08, h: 0.08, flag: "twinkle" as LightFlag, color: "accent" as LightColor };
      }),
      { at: [-3.35, 2.4], w: 0.22, h: 0.28, flag: "flicker" }
    ],
    extras: [{ kind: "motes", at: [-0.4, 3.0], radius: 2.6, count: 40, color: "bright" }],
    beacon: [-3.35, 2.4],
    beaconSize: 2.0,
    beaconColor: "warm",
    ground: "hill",
    reveal: 2,
    lightDir: [0.8, 0.5]
  }
};

export const LANDMARK_NAMES: Record<ThemeKey, string> = Object.fromEntries(
  Object.entries(LANDMARKS).map(([key, spec]) => [key, spec.name])
) as Record<ThemeKey, string>;

/* ── ground strips ────────────────────────────────────────────────────── */

function groundPoly(kind: GroundKind, rand: () => number): Poly {
  const out: Poly = [];
  const span = 18;
  const steps = 72;
  for (let i = 0; i <= steps; i += 1) {
    const x = -span + (2 * span * i) / steps;
    const edge = x * x;
    let y = 0;
    switch (kind) {
      case "hill": y = -0.06 + Math.sin(x * 0.42) * 0.08 + Math.sin(x * 1.3 + 1) * 0.03 + edge * 0.007; break;
      case "crag": y = -0.12 + rand() * 0.22 + edge * 0.009; break;
      case "street": y = Math.abs(x) < 6.5 ? 0 : 0.08 + edge * 0.0015; break;
      case "dunes": y = Math.sin(x * 0.3 + 1) * 0.12 + Math.sin(x * 0.13) * 0.16 + edge * 0.005; break;
      case "rubble": y = -0.05 + (rand() < 0.3 ? rand() * 0.35 : rand() * 0.1) + edge * 0.006; break;
      case "shore": y = -0.3 + Math.sin(x * 0.8) * 0.02 + (Math.abs(x) > 6 ? (Math.abs(x) - 6) * 0.25 + rand() * 0.2 : 0); break;
      case "mound": y = -0.05 + Math.sin(x * 0.6) * 0.1 + rand() * 0.06 + edge * 0.008; break;
    }
    out.push([x, y]);
  }
  out.push([span, -3.6], [-span, -3.6]);
  return out;
}

/* ── the silhouette material ──────────────────────────────────────────── */

const SIL_VERT = `
uniform vec3 uOrigin;
uniform float uScale;
varying vec3 vP;
varying vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vP = (w.xyz - uOrigin) / uScale;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SIL_FRAG = `
uniform float uReveal;
uniform float uMode;
uniform float uHeight;
uniform float uWidth;
uniform vec2 uBeacon;
uniform float uTime;
uniform vec3 uBase;
uniform vec3 uBaseTop;
uniform vec3 uRim;
uniform float uRimAmt;
uniform vec2 uLightDir;
uniform vec3 uEdge;
uniform float uEdgeGain;
uniform float uGild;
uniform vec3 uGildCol;
uniform float uAsh;
uniform vec3 uEmberCol;
uniform float uFrost;
uniform vec3 uFrostCol;
uniform float uDivide;
uniform float uOpacity;
uniform float uExposure;
uniform float uTone;
uniform vec3 uGlowCol;
uniform float uGlowAmt;
varying vec3 vP;
varying vec3 vN;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  float h = vP.y / uHeight;
  float xn = vP.x / uWidth;
  int mode = int(uMode + 0.5);
  float f;
  if (mode == 0) f = h + noise(vP.xy * 3.0) * 0.06;
  else if (mode == 1) f = 1.0 - h + noise(vec2(vP.y * 40.0, 0.5)) * 0.03;
  else if (mode == 2) f = length(vP.xy - uBeacon) / (uHeight * 1.1) + noise(vP.xy * 2.5) * 0.08;
  else f = noise(vP.xy * 2.2) * 0.75 + h * 0.25;
  float r = uReveal * 1.14 - 0.07;
  if (r < f) discard;
  float live = 1.0 - step(0.999, uReveal);
  float edge = exp(-(r - f) * 26.0) * live;

  float front = smoothstep(0.55, 0.92, vN.z);
  vec2 n2 = vN.xy;
  float side = length(n2);
  float rim = side > 0.01 ? max(0.0, dot(n2 / side, normalize(uLightDir))) * side * (1.0 - front) : 0.0;

  vec3 col;
  if (uTone > 1.5) {
    // Emissive parts: neon, crystals, rings, holo panels.
    float flick = 0.88 + 0.12 * sin(uTime * 7.0 + vP.x * 3.0);
    col = uGlowCol * uGlowAmt * flick * (0.55 + 0.45 * front) + uGlowCol * rim * 0.6;
  } else {
    float tex = 0.86 + 0.14 * noise(vP.xy * 7.0);
    col = mix(uBase, uBaseTop, clamp(h, 0.0, 1.0)) * tex;
    if (uTone > 0.5) { col *= 0.62; rim *= 0.3; }
    col += uRim * rim * uRimAmt;
  }

  float right = smoothstep(-0.03, 0.03, xn);
  float gild = uGild * mix(1.0, right, uDivide);
  float ash = uAsh * mix(1.0, 1.0 - right, uDivide);
  if (gild > 0.001) {
    col += uGildCol * gild * (front * (0.06 + 0.22 * clamp(h, 0.0, 1.0)) + rim * 1.4);
  }
  if (ash > 0.001) {
    col = mix(col, col * vec3(0.42, 0.38, 0.36), ash * 0.8);
    float n = noise(vP.xy * 3.2 + 4.0);
    float crack = 1.0 - smoothstep(0.0, 0.035, abs(n - 0.5));
    float throb = 0.65 + 0.35 * sin(uTime * 2.6 + vP.x * 3.0 + vP.y * 2.0);
    col += uEmberCol * crack * ash * throb * (0.4 + front * 0.9);
  }
  if (uFrost > 0.001) {
    float lum = dot(col, vec3(0.3, 0.59, 0.11));
    vec3 ice = uFrostCol * (0.16 + lum * 1.6) + uFrostCol * rim * 0.9;
    float sheen = smoothstep(0.92, 1.0, sin((vP.x + vP.y * 0.6) * 4.0)) * front;
    col = mix(col, ice + uFrostCol * sheen * 0.35, uFrost * 0.85);
  }
  col += uEdge * edge * uEdgeGain;
  col *= uExposure;
  gl_FragColor = vec4(col, uOpacity);
  #include <colorspace_fragment>
}`;

type SilUniforms = Record<string, { value: unknown }>;

/* ── runtime ──────────────────────────────────────────────────────────── */

export type LandmarkFrame = {
  t: number;
  dt: number;
  pulse: MusicPulse;
  /** Outline thread drawn on, 0..1. */
  trace: number;
  /** Outline thread brightness (it fades back to a rim once the matter fills). */
  outline: number;
  /** Matter fill, 0..1. */
  fill: number;
  /** Ground strip reveal, 0..1. */
  ground: number;
  /** How many windows are lit (fractional: the next one is fading up). */
  lit: number;
  lightBoost: number;
  /** Beacon intensity, 0..~2. */
  beacon: number;
  /** Rig motion amount (0 = held at rest). */
  motion: number;
  /** Beams, smoke and motes strength. */
  extras: number;
  gild: number;
  ash: number;
  frost: number;
  divide: number;
  exposure: number;
  opacity: number;
  /** Music reactivity scaler for this theme. */
  react: number;
};

export type LandmarkPiece = {
  object: THREE.Object3D;
  home: THREE.Vector3;
  /** Piece centre in landmark space. */
  cx: number;
  cy: number;
};

export type Landmark = {
  name: string;
  group: THREE.Group;
  height: number;
  width: number;
  lightCount: number;
  pieces: LandmarkPiece[];
  beaconColor: THREE.Color;
  /** Beacon colour override (cast credits tint it to the hero). */
  beaconTint: THREE.Color;
  beaconTintAmt: number;
  beaconWorld: (out: THREE.Vector3) => THREE.Vector3;
  nibWorld: (out: THREE.Vector3) => THREE.Vector3;
  particles: ParticleSystem;
  update: (frame: LandmarkFrame) => void;
  setPixelScale: (scale: number) => void;
};

export type LandmarkShared = {
  glow: THREE.Texture;
  atlas: THREE.Texture;
};

/** Soft window tile: opaque core, feathered glow round it. */
function windowTexture() {
  return canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.fillRect(18, 18, 28, 28);
  });
}

export type LandmarkOptions = {
  /** Deep extrusions that hold up from an orbiting camera (the island stage). */
  thick?: boolean;
  /** The flat ground strip under it (off when it stands on the island). */
  ground?: boolean;
};

const inside = (poly: Poly, x: number, y: number) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

export function createLandmark(visual: ThemeVisual, tracker: Tracker, shared: LandmarkShared, options: LandmarkOptions = {}): Landmark {
  const thick = options.thick ?? false;
  const spec = LANDMARKS[visual.key] || LANDMARKS.none;
  const rand = mulberry32(hashString(visual.key) ^ 0x51a7);
  const group = new THREE.Group();

  const accent = new THREE.Color(visual.accent);
  const bright = new THREE.Color(visual.accentBright);
  const secondary = new THREE.Color(visual.secondary);
  const resolve = (c: LightColor | undefined): THREE.Color => {
    switch (c ?? spec.windowColor ?? "warm") {
      case "accent": return accent.clone().lerp(bright, 0.35);
      case "secondary": return secondary.clone().lerp(new THREE.Color("#ffffff"), 0.15);
      case "bright": return bright.clone().lerp(new THREE.Color("#ffffff"), 0.35);
      case "red": return new THREE.Color("#ff3b3b");
      case "cool": return new THREE.Color("#cfe6ff");
      default: return new THREE.Color("#ffc477").lerp(bright, 0.15);
    }
  };

  // Bounds (parts only — the ground strip is scenery).
  let minX = Infinity, maxX = -Infinity, maxY = 0;
  for (const part of spec.parts) for (const [x, y] of part.poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const height = Math.max(1, maxY);
  const width = Math.max(1, maxX - minX);

  /* materials */
  const baseCol = new THREE.Color(visual.loom.world).multiplyScalar(0.32).lerp(new THREE.Color(visual.fog), 0.45);
  const shared$: SilUniforms = {
    uOrigin: { value: new THREE.Vector3() },
    uScale: { value: 1 },
    uReveal: { value: 0 },
    uMode: { value: spec.reveal },
    uHeight: { value: height },
    uWidth: { value: width },
    uBeacon: { value: new THREE.Vector2(spec.beacon[0], spec.beacon[1]) },
    uTime: { value: 0 },
    uBase: { value: baseCol.clone() },
    uBaseTop: { value: baseCol.clone().lerp(new THREE.Color(visual.secondary), 0.12).multiplyScalar(1.25) },
    uRim: { value: accent.clone().lerp(bright, 0.4) },
    uRimAmt: { value: 0.9 },
    uLightDir: { value: new THREE.Vector2(spec.lightDir[0], spec.lightDir[1]) },
    uEdge: { value: bright.clone() },
    uEdgeGain: { value: 1.4 },
    uGild: { value: 0 },
    uGildCol: { value: new THREE.Color("#ffcf7a").lerp(bright, 0.3) },
    uAsh: { value: 0 },
    uEmberCol: { value: new THREE.Color("#ff5a24") },
    uFrost: { value: 0 },
    uFrostCol: { value: new THREE.Color("#bcd4ee") },
    uDivide: { value: 0 },
    uOpacity: { value: 1 },
    uExposure: { value: 1 }
  };
  const makeMaterial = (tone: Tone, own: SilUniforms = {}) => {
    const glowCol = tone === "glowA" ? accent.clone().lerp(bright, 0.3)
      : tone === "glowB" ? secondary.clone()
        : tone === "glowH" ? bright.clone()
          : tone === "glowR" ? new THREE.Color("#ff3550")
            : new THREE.Color();
    return tracker.track(new THREE.ShaderMaterial({
      uniforms: {
        ...shared$,
        uTone: { value: tone === "body" ? 0 : tone === "ground" ? 1 : 2 },
        uGlowCol: { value: glowCol },
        uGlowAmt: { value: 1 },
        ...own
      },
      vertexShader: SIL_VERT,
      fragmentShader: SIL_FRAG,
      transparent: true
    }));
  };
  const materials = new Map<Tone, THREE.ShaderMaterial>();
  const materialFor = (tone: Tone) => {
    let m = materials.get(tone);
    if (!m) {
      m = makeMaterial(tone);
      materials.set(tone, m);
    }
    return m;
  };
  const groundReveal = { value: 0 };
  const groundMaterial = makeMaterial("ground", { uReveal: groundReveal, uMode: { value: 0 } });

  /* rig groups: index 0 is the landmark itself, 1.. are the spec's rigs */
  const rigSpecs = spec.rigs || [];
  const rigGroups: THREE.Group[] = [group];
  const pivots: Pt[] = [[0, 0]];
  for (const rig of rigSpecs) {
    const g = new THREE.Group();
    g.position.set(rig.pivot[0], rig.pivot[1], 0);
    if (rig.tilt) g.rotation.x = rig.tilt;
    group.add(g);
    rigGroups.push(g);
    pivots.push(rig.pivot);
  }
  const rigAngle = new Float32Array(rigSpecs.length);

  /* parts */
  const pieces: LandmarkPiece[] = [];
  const outlines: Array<Array<{ path: Poly; minY: number; z: number }>> = rigGroups.map(() => []);
  const fronts: Array<{ part: PartSpec; gi: number; front: number }> = [];
  for (const part of spec.parts) {
    const gi = part.rig === undefined ? 0 : part.rig + 1;
    const [px, py] = pivots[gi];
    const xs = part.poly.map(([x]) => x);
    const span = Math.max(...xs) - Math.min(...xs);
    const depth = !thick
      ? part.depth ?? 0.6
      : part.depth === undefined
        ? Math.min(Math.max(span, 0.6), 1.8)
        : part.depth >= 0.3 ? Math.max(part.depth, Math.min(span, 1.8)) : part.depth;
    const front = (part.z ?? 0) + depth / 2;
    fronts.push({ part, gi, front });
    let cx = 0, cy = 0;
    for (const [x, y] of part.poly) {
      cx += x;
      cy += y;
    }
    cx /= part.poly.length;
    cy /= part.poly.length;
    const shape = new THREE.Shape(part.poly.map(([x, y]) => new THREE.Vector2(x - cx, y - cy)));
    for (const hole of part.holes || []) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x - cx, y - cy))));
    const geometry = tracker.track(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 }));
    geometry.translate(0, 0, -depth / 2 + (part.z ?? 0));
    const mesh = new THREE.Mesh(geometry, materialFor(part.tone ?? "body"));
    mesh.renderOrder = 10;
    const piece = new THREE.Group();
    piece.position.set(cx - px, cy - py, 0);
    piece.add(mesh);
    rigGroups[gi].add(piece);
    pieces.push({ object: piece, home: piece.position.clone(), cx, cy });
    const minY = Math.min(...part.poly.map(([, y]) => y));
    outlines[gi].push({ path: part.poly.map(([x, y]) => [x - px, y - py] as Pt), minY, z: front + 0.025 });
    for (const hole of part.holes || []) outlines[gi].push({ path: hole.map(([x, y]) => [x - px, y - py] as Pt), minY: minY + 0.01, z: front + 0.025 });
  }

  /** Front face depth at a point (the frontmost part covering it). */
  const frontAt = (gi: number, x: number, y: number, fallback: number) => {
    let best = -Infinity;
    for (const f of fronts) if (f.gi === gi && f.front > best && inside(f.part.poly, x, y)) best = f.front;
    return best === -Infinity ? fallback : best;
  };

  /* ground */
  if (options.ground ?? true) {
    const poly = groundPoly(spec.ground, rand);
    const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
    const geometry = tracker.track(new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: false }));
    geometry.translate(0, 0, -0.6);
    const mesh = new THREE.Mesh(geometry, groundMaterial);
    mesh.renderOrder = 9;
    group.add(mesh);
  }

  /* threads: one ribbon per rig group, ordered bottom-up, sharing one trace clock */
  const lengths = outlines.map((list) => list.reduce((sum, { path }) => {
    let len = 0;
    for (let i = 0; i < path.length; i += 1) {
      const a = path[i];
      const b = path[(i + 1) % path.length];
      len += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return sum + len;
  }, 0));
  const totalLength = lengths.reduce((a, b) => a + b, 0) || 1;
  const ribbons: Array<{ ribbon: TraceRibbon; t0: number; t1: number; group: THREE.Group }> = [];
  {
    let acc = 0;
    outlines.forEach((list, gi) => {
      if (!list.length) return;
      const sorted = [...list].sort((a, b) => a.minY - b.minY);
      const ribbon = createTraceRibbon(tracker, sorted.map((o) => o.path), 0.045, 0.34, true, sorted.map((o) => o.z));
      ribbon.uniforms.uColor.value.copy(accent).lerp(bright, 0.2);
      ribbon.uniforms.uHot.value.copy(bright).lerp(new THREE.Color("#ffffff"), 0.5);
      ribbon.mesh.renderOrder = 12;
      rigGroups[gi].add(ribbon.mesh);
      const t0 = acc / totalLength;
      acc += lengths[gi];
      ribbons.push({ ribbon, t0, t1: acc / totalLength, group: rigGroups[gi] });
    });
  }

  /* windows: merged quads per rig group, lit bottom-up in a shuffled-ish order */
  const winTexture = tracker.track(windowTexture());
  type Win = { mesh: THREE.Mesh; colors: Float32Array; attr: THREE.BufferAttribute; lights: Array<{ base: THREE.Color; rank: number; flag?: LightFlag; phase: number; offset: number }> };
  const windows: Win[] = [];
  const order = spec.lights
    .map((light, index) => ({ index, key: light.at[1] + rand() * 0.9 }))
    .sort((a, b) => a.key - b.key)
    .map((entry, rank) => ({ ...entry, rank }));
  const rankOf = new Map(order.map((o) => [o.index, o.rank]));
  rigGroups.forEach((g, gi) => {
    const lights = spec.lights.map((light, index) => ({ light, index })).filter(({ light }) => (light.rig === undefined ? 0 : light.rig + 1) === gi);
    if (!lights.length) return;
    const [px, py] = pivots[gi];
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    lights.forEach(({ light }, k) => {
      const w = (light.w ?? 0.3) * 1.8;
      const h = (light.h ?? 0.4) * 1.8;
      const x = light.at[0] - px;
      const y = light.at[1] - py;
      const z = frontAt(gi, light.at[0], light.at[1], 0.4) + 0.03;
      positions.push(x - w / 2, y - h / 2, z, x + w / 2, y - h / 2, z, x + w / 2, y + h / 2, z, x - w / 2, y + h / 2, z);
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      const b = k * 4;
      indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const colors = new Float32Array(lights.length * 12);
    const geometry = tracker.track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    const material = tracker.track(new THREE.MeshBasicMaterial({
      map: winTexture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    }));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 11;
    mesh.frustumCulled = false;
    g.add(mesh);
    windows.push({
      mesh,
      colors,
      attr: geometry.getAttribute("color") as THREE.BufferAttribute,
      lights: lights.map(({ light, index }) => ({
        base: resolve(light.color),
        rank: rankOf.get(index) ?? 0,
        flag: light.flag,
        phase: rand() * TAU,
        // A few windows stay dark even in a lit world — real buildings do.
        offset: rand() < 0.18 && !light.flag ? 0.25 : 1
      }))
    });
  });

  /* beacon */
  const beaconColor = resolve(spec.beaconColor);
  const beaconTint = beaconColor.clone();
  const beaconHost = rigGroups[spec.beaconRig === undefined ? 0 : spec.beaconRig + 1];
  const beaconPivot = pivots[spec.beaconRig === undefined ? 0 : spec.beaconRig + 1];
  const beaconHalo = glowSprite(tracker, shared.glow, beaconColor, 0);
  const beaconCore = glowSprite(tracker, shared.glow, new THREE.Color("#ffffff"), 0);
  const beaconGi = spec.beaconRig === undefined ? 0 : spec.beaconRig + 1;
  beaconHalo.position.set(spec.beacon[0] - beaconPivot[0], spec.beacon[1] - beaconPivot[1], frontAt(beaconGi, spec.beacon[0], spec.beacon[1], 0.4) + 0.15);
  beaconCore.position.copy(beaconHalo.position);
  beaconHalo.renderOrder = 13;
  beaconCore.renderOrder = 14;
  beaconHost.add(beaconHalo, beaconCore);
  const currentBeacon = beaconColor.clone();

  /* extras */
  const shaft = tracker.track(shaftTexture());
  const particles = createParticles(tracker, shared.atlas, 160);
  particles.points.renderOrder = 8;
  group.add(particles.points);
  type ExtraRuntime = (frame: LandmarkFrame, level: number) => void;
  const extras: ExtraRuntime[] = [];
  const smokeColor = new THREE.Color(visual.fog).lerp(new THREE.Color("#9a9690"), 0.55);
  for (const extra of spec.extras || []) {
    if (extra.kind === "beam") {
      const material = tracker.track(new THREE.MeshBasicMaterial({ map: shaft, color: resolve(extra.color), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      const geometry = tracker.track(new THREE.PlaneGeometry(1, 1));
      geometry.translate(0, 0.5, 0);
      const beam = new THREE.Mesh(geometry, material);
      beam.position.set(extra.from[0], extra.from[1], 0.2);
      beam.scale.set(extra.width, extra.length, 1);
      beam.renderOrder = 7;
      group.add(beam);
      let cap: THREE.Sprite | null = null;
      if (extra.cap) {
        cap = glowSprite(tracker, shared.glow, resolve(extra.color), 0);
        cap.renderOrder = 7;
        group.add(cap);
      }
      extras.push((frame, level) => {
        const sweep = (extra.sweep ?? 0) * Math.sin(frame.t * (extra.rate ?? 0.3)) * frame.motion;
        beam.rotation.z = extra.angle - Math.PI / 2 + sweep;
        material.opacity = level * (0.22 + frame.pulse.swell * 0.25 * frame.react);
        if (cap) {
          const a = beam.rotation.z + Math.PI / 2;
          cap.position.set(extra.from[0] + Math.cos(a) * extra.length * 0.92, extra.from[1] + Math.sin(a) * extra.length * 0.92, 0.2);
          cap.scale.setScalar(extra.width * 3.2 * (1 + frame.pulse.kick * 0.12 * frame.react));
          cap.material.opacity = level * 0.55;
        }
      });
    } else if (extra.kind === "lighthouse") {
      const color = resolve(extra.color);
      const make = () => {
        const material = tracker.track(new THREE.MeshBasicMaterial({ map: shaft, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
        const geometry = tracker.track(new THREE.PlaneGeometry(1, 1));
        geometry.translate(0, 0.5, 0);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(extra.from[0], extra.from[1], 0.6);
        mesh.renderOrder = 15;
        group.add(mesh);
        return { mesh, material };
      };
      const beams = [make(), make()];
      const flare = glowSprite(tracker, shared.glow, color, 0);
      flare.position.set(extra.from[0], extra.from[1], 0.7);
      flare.renderOrder = 16;
      group.add(flare);
      let phase = 0;
      extras.push((frame, level) => {
        phase += frame.dt * extra.rate * (0.4 + frame.motion * 0.6);
        const c = Math.cos(phase);
        const s = Math.sin(phase);
        beams.forEach(({ mesh, material }, i) => {
          const dir = i === 0 ? 1 : -1;
          // The beam turns about the tower: its on-screen length is the
          // projection, and it blazes when it swings toward the room.
          mesh.rotation.z = dir * c > 0 ? -Math.PI / 2 : Math.PI / 2;
          mesh.scale.set(extra.width * (0.6 + Math.abs(s) * 0.8), extra.length * Math.max(0.05, Math.abs(c)), 1);
          material.opacity = level * (0.28 + Math.abs(c) * 0.12) * (i === 0 ? 1 : 0.7);
        });
        const facing = Math.max(0, s);
        flare.scale.setScalar(1.5 + facing * facing * 7);
        flare.material.opacity = level * facing * facing * 0.85;
      });
    } else if (extra.kind === "smoke") {
      let acc = 0;
      extras.push((frame, level) => {
        if (level < 0.05 || frame.motion < 0.05) return;
        acc += frame.dt * extra.rate * 3.2 * level;
        while (acc > 1) {
          acc -= 1;
          particles.spawn({
            x: extra.at[0] + (rand() - 0.5) * 0.15,
            y: extra.at[1],
            z: 0.1,
            vx: 0.15 + rand() * 0.15,
            vy: 0.35 + rand() * 0.3,
            life: 3.2 + rand() * 1.6,
            size: (extra.size ?? 0.6) * (0.5 + rand() * 0.3),
            grow: 3.2,
            alpha: 0.14,
            color: smokeColor,
            drag: 0.25,
            flutter: 0.08
          });
        }
      });
    } else if (extra.kind === "motes") {
      const count = extra.count;
      const positions = new Float32Array(count * 3);
      const seeds = Array.from({ length: count }, () => [rand() * TAU, 0.35 + rand() * 0.75, (rand() - 0.5) * 2, 0.3 + rand() * 0.9]);
      const geometry = tracker.track(new THREE.BufferGeometry());
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = tracker.track(new THREE.PointsMaterial({ map: shared.glow, color: resolve(extra.color), size: 0.16, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false }));
      const points = new THREE.Points(geometry, material);
      points.renderOrder = 13;
      points.frustumCulled = false;
      const host = extra.rig === undefined ? group : rigGroups[extra.rig + 1];
      const [hx, hy] = extra.rig === undefined ? [0, 0] : pivots[extra.rig + 1];
      host.add(points);
      const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
      let clock = 0;
      extras.push((frame, level) => {
        clock += frame.dt * (0.4 + frame.motion * 0.6) * (1 + frame.pulse.mid * 0.5 * frame.react);
        for (let i = 0; i < count; i += 1) {
          const [a0, rr, yy, sp] = seeds[i];
          const a = a0 + clock * sp;
          const radius = extra.radius * rr * (1 + frame.pulse.kick * 0.15 * frame.react);
          positions[i * 3] = extra.at[0] - hx + Math.cos(a) * radius;
          positions[i * 3 + 1] = extra.at[1] - hy + yy * extra.radius * 0.45 + Math.sin(a * 1.7) * 0.15;
          positions[i * 3 + 2] = Math.sin(a) * radius * 0.6 + 0.3;
        }
        attr.needsUpdate = true;
        material.opacity = level * (0.5 + frame.pulse.hat * 0.5 * frame.react);
      });
    }
  }

  const tmp = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  const lightCount = spec.lights.length;
  let blinkClock = 0;
  let snareFlash = 0;
  let lastTrace = 0;

  const api: Landmark = {
    name: spec.name,
    group,
    height,
    width,
    lightCount,
    pieces,
    beaconColor,
    beaconTint,
    beaconTintAmt: 0,
    particles,
    setPixelScale: (scale) => particles.setScale(scale),
    beaconWorld: (out) => beaconHalo.getWorldPosition(out),
    nibWorld: (out) => {
      for (const entry of ribbons) {
        const local = trace01(entry, lastTrace);
        if (local !== null) {
          entry.ribbon.pointAt(local, out);
          return entry.group.localToWorld(out);
        }
      }
      return beaconHalo.getWorldPosition(out);
    },
    update(frame) {
      lastTrace = frame.trace;
      const { t, dt, pulse } = frame;
      const react = frame.react;
      group.updateMatrixWorld();
      group.getWorldPosition(tmp);
      (shared$.uOrigin.value as THREE.Vector3).copy(tmp);
      shared$.uScale.value = group.scale.y || 1;
      shared$.uReveal.value = frame.fill;
      groundReveal.value = frame.ground;
      shared$.uTime.value = t;
      shared$.uGild.value = frame.gild;
      shared$.uAsh.value = frame.ash;
      shared$.uFrost.value = frame.frost;
      shared$.uDivide.value = frame.divide;
      shared$.uOpacity.value = frame.opacity;
      shared$.uExposure.value = frame.exposure;
      shared$.uRimAmt.value = 0.75 + pulse.swell * 0.5 * react + pulse.kick * 0.25 * react;
      shared$.uEdgeGain.value = 1.3 + pulse.kick * 1.4 * react;
      const glowAmt = 0.25 + frame.fill * 0.85 + pulse.snare * 0.35 * react;
      for (const [tone, material] of materials) {
        if (tone.startsWith("glow")) material.uniforms.uGlowAmt.value = glowAmt * (tone === "glowR" ? 0.9 + 0.1 * Math.sin(t * 23) : 1);
      }

      // Rigs come alive with `motion` (held at rest while being woven).
      rigSpecs.forEach((rig, i) => {
        const g = rigGroups[i + 1];
        if (rig.kind === "spin") {
          rigAngle[i] += dt * rig.rate * frame.motion * (1 + pulse.mid * 0.4 * react);
          g.rotation.z = rigAngle[i];
        } else if (rig.kind === "sway") {
          g.rotation.z = Math.sin(t * rig.rate + i) * (rig.amp ?? 0.1) * frame.motion * (1 + pulse.swell * 0.6 * react);
        } else {
          g.position.y = rig.pivot[1] + Math.sin(t * rig.rate + i * 2) * (rig.amp ?? 0.1) * frame.motion;
        }
      });

      // Threads.
      for (const { ribbon, t0, t1 } of ribbons) {
        const u = ribbon.uniforms;
        u.uTrace.value = frame.trace >= 0.999 ? 1 : clamp01((frame.trace - t0) / Math.max(1e-6, t1 - t0)) * 1.0001;
        u.uAlpha.value = frame.outline * (1 + pulse.hat * 0.5 * react);
        u.uNib.value = frame.trace > t0 && frame.trace < t1 ? 1 : 0;
        u.uTime.value = t;
        u.uShimmer.value = pulse.hat * react;
      }

      // Windows.
      blinkClock += dt;
      if (pulse.snareHit) snareFlash = 1;
      snareFlash = Math.max(0, snareFlash - dt * 3);
      for (const win of windows) {
        win.lights.forEach((light, k) => {
          let on = clamp01(frame.lit - light.rank) * light.offset;
          if (light.flag === "flicker") on *= 0.78 + 0.22 * Math.sin(t * 13 + light.phase) * Math.sin(t * 5.3 + light.phase * 2);
          else if (light.flag === "twinkle") on *= 0.65 + 0.35 * Math.sin(t * 2.2 + light.phase) + pulse.hat * 0.5 * react;
          else if (light.flag === "blink") on *= (Math.sin(t * 2.4 + light.phase) > 0.4 ? 1 : 0.15) + snareFlash * 0.5 * react;
          else if (light.flag === "eyes") on *= ((blinkClock + light.phase * 0.3) % 5.2 < 0.16 ? 0 : 1) * (0.7 + snareFlash * 1.2 * react);
          const v = on * frame.lightBoost;
          for (let q = 0; q < 4; q += 1) {
            win.colors[k * 12 + q * 3] = light.base.r * v;
            win.colors[k * 12 + q * 3 + 1] = light.base.g * v;
            win.colors[k * 12 + q * 3 + 2] = light.base.b * v;
          }
        });
        win.attr.needsUpdate = true;
      }

      // Beacon.
      currentBeacon.copy(beaconColor).lerp(beaconTint, api.beaconTintAmt);
      const b = frame.beacon * (1 + pulse.swell * 0.35 * react + pulse.kick * 0.2 * react);
      beaconHalo.material.color.copy(currentBeacon);
      beaconHalo.material.opacity = clamp01(b * 0.75);
      beaconHalo.scale.setScalar(spec.beaconSize * (0.55 + b * 0.5));
      beaconCore.material.color.copy(tmpColor.copy(currentBeacon).lerp(new THREE.Color(1, 1, 1), 0.6));
      beaconCore.material.opacity = clamp01(b * 0.9);
      beaconCore.scale.setScalar(spec.beaconSize * 0.22 * (0.6 + b * 0.4));

      for (const extra of extras) extra(frame, frame.extras);
      particles.update(frame.motion > 0.01 ? dt : 0);
    }
  };
  return api;

  function trace01(entry: { t0: number; t1: number }, t: number) {
    if (t < entry.t0 || t > entry.t1) return null;
    return (t - entry.t0) / Math.max(1e-6, entry.t1 - entry.t0);
  }
}

