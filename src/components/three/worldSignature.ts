"use client";

import * as THREE from "three";
import type { ThemeKey, ThemeVisual } from "./themeVisuals";

/**
 * Signature ground, ritual circle, and inhabitants.
 *
 * The Weaving used to give every genre the same holographic floor, the same
 * glyph ring, and an island with nobody on it. Three things fixed here:
 *
 *   GROUND     — the foundation plane gets a per-genre surface. Pirate worlds
 *                are built over a luminous SEA (moving swell, caustics, foam);
 *                cyberpunk over a live circuit board; gothic over cathedral
 *                tracery; horror over throbbing veins; the frontier over
 *                cracked hardpan; steampunk over turning gearwork. The floor
 *                is the largest surface on screen, so this is the single
 *                biggest change to how a theme reads.
 *   FIGURE     — a genre-specific magic circle (pentacle, hexagram, compass
 *                rose, circuit die, gear, lotus mandala, deco fan…) ignites
 *                inside the inscription as the weave charges.
 *   INHABITANTS— the island is no longer empty. Tiny luminous figures live on
 *                the plateau and act out the genre: duellists trading blows on
 *                the SNARE, a hooded circle at rite, smiths hammering on the
 *                KICK, a patrol walking the rim, statues standing vigil.
 *
 * Everything here is line-art and one-shader cheap: no textures loaded, no
 * extra draw calls beyond one plane, one disc, and one LineSegments.
 */

/* ── ground surfaces ─────────────────────────────────────────────────────── */

export type GroundMode =
  | "grid"
  | "water"
  | "circuit"
  | "tracery"
  | "veins"
  | "waste"
  | "raked"
  | "gears"
  | "hearth"
  | "street";

export const GROUND: Record<ThemeKey, GroundMode> = {
  none: "grid",
  // Arcane rose-window tracery under the spires.
  fantasy: "tracery",
  scifi: "circuit",
  // Something under the floor is alive and it is breathing.
  horror: "veins",
  noir: "street",
  modern: "grid",
  western: "waste",
  postapoc: "waste",
  cyberpunk: "circuit",
  spaceopera: "circuit",
  gothic: "tracery",
  urbanfantasy: "street",
  steampunk: "gears",
  // The whole world floats on open water.
  pirate: "water",
  eastasian: "raked",
  superhero: "street",
  pulp: "waste",
  cozy: "hearth"
};

/** Per-mode structure code. Each snippet sets `st` (form) and `hi` (highlight). */
const GROUND_BODY: Record<GroundMode, string[]> = {
  grid: [
    "float ringLine = 1.0 - smoothstep(0.0, 0.09, abs(fract(r / 1.7) - 0.5) * 1.7);",
    "float spoke = 1.0 - smoothstep(0.0, 0.055, abs(fract(ang * 24.0 + uSpin) - 0.5) * (6.2831853 / 24.0) * r);",
    "st = ringLine * 0.42 + spoke * 0.26;",
    "hi = ringLine * 0.5;"
  ],
  water: [
    // A long ocean swell rolling outward, cross-chop over it, and a caustic
    // mesh where the two wave trains interfere — the classic sunlit-shallows
    // read, done with two multiplied sines.
    "float wave = 0.5 + 0.5 * sin(r * 1.05 - uTime * 1.45);",
    "float chop = sin(p.x * 0.82 + uTime * 1.15) * sin(p.y * 0.69 - uTime * 0.92);",
    "float caustic = pow(abs(sin(p.x * 1.42 + uTime * 0.85 + chop * 0.6) * sin(p.y * 1.27 - uTime * 0.7)), 8.0);",
    "float foam = smoothstep(0.62, 1.0, wave) * (0.55 + 0.45 * chop);",
    "float glint = pow(max(0.0, chop), 12.0);",
    "st = pow(wave, 3.0) * 0.34 + caustic * 0.8 + foam * 0.3;",
    "hi = caustic * 0.9 + foam * 0.7 + glint * 0.6;"
  ],
  circuit: [
    "float cell = 1.85;",
    "float dx = abs(fract(p.x / cell) - 0.5) * cell;",
    "float dy = abs(fract(p.y / cell) - 0.5) * cell;",
    "float trace = (1.0 - smoothstep(0.0, 0.07, dx)) + (1.0 - smoothstep(0.0, 0.07, dy));",
    "float pad = 1.0 - smoothstep(0.12, 0.3, max(dx, dy));",
    // Data packets run the traces: a hard-edged dash travelling in x along the
    // horizontal runs and in y along the vertical ones.
    "float dataX = (1.0 - smoothstep(0.0, 0.14, dy)) * pow(max(0.0, sin(p.x * 1.05 - uTime * 3.1)), 26.0);",
    "float dataY = (1.0 - smoothstep(0.0, 0.14, dx)) * pow(max(0.0, sin(p.y * 1.05 + uTime * 2.5)), 26.0);",
    "st = trace * 0.2 + pad * 0.2;",
    "hi = (dataX + dataY) * 1.1 + pad * 0.35;"
  ],
  tracery: [
    "float petals = abs(sin(ang * 6.2831853 * 6.0));",
    "float rose = 1.0 - smoothstep(0.0, 0.1, abs(fract(r / 2.6 + petals * 0.17) - 0.5) * 2.6);",
    "float rib = 1.0 - smoothstep(0.0, 0.05, abs(fract(ang * 12.0 + uSpin * 0.5) - 0.5) * (6.2831853 / 12.0) * r);",
    // A scalloped outer arcade — the pointed arches of a nave, seen in plan.
    "float arch = 1.0 - smoothstep(0.0, 0.13, abs(r - 6.6 - sin(ang * 6.2831853 * 6.0) * 0.6));",
    "st = rose * 0.28 + rib * 0.22 + arch * 0.45;",
    "hi = arch * 0.8 + rose * 0.35;"
  ],
  veins: [
    // Domain-warped sine ridges: organic, branching, and slow. The throb
    // travels outward so the floor reads as something with a pulse.
    "float n = sin(p.x * 0.68 + sin(p.y * 0.41 + uTime * 0.28) * 2.3)",
    "  + sin(p.y * 0.59 + sin(p.x * 0.35 - uTime * 0.22) * 2.1);",
    "float vein = 1.0 - smoothstep(0.0, 0.36, abs(n));",
    "float throb = 0.5 + 0.5 * sin(uTime * 1.25 - r * 0.46);",
    "st = vein * 0.48 * (0.45 + throb * 0.75);",
    "hi = pow(vein, 3.0) * throb * 0.9;"
  ],
  waste: [
    "float c1 = 1.0 - smoothstep(0.0, 0.2, abs(sin(p.x * 0.4 + p.y * 0.2 + sin(p.y * 0.29) * 1.5)));",
    "float c2 = 1.0 - smoothstep(0.0, 0.16, abs(sin(p.x * 0.18 - p.y * 0.45 + sin(p.x * 0.25) * 1.8)));",
    // Dust rolling across the pan, so the ground itself looks windblown.
    "float drift = 0.5 + 0.5 * sin(p.y * 0.46 + uTime * 0.95 + p.x * 0.11);",
    "st = (c1 * 0.32 + c2 * 0.26) * (0.65 + drift * 0.45);",
    "hi = c1 * c2 * 1.3 + drift * 0.1;"
  ],
  raked: [
    // Concentric rake lines around an off-center stone, plus a lattice on the
    // diagonal and a lotus bloom out at the garden's edge.
    "vec2 o = p - vec2(2.4, -1.5);",
    "float rr = length(o);",
    "float rake = 1.0 - smoothstep(0.0, 0.13, abs(fract(rr / 1.05) - 0.5) * 1.05);",
    "float lat = (1.0 - smoothstep(0.0, 0.05, abs(fract((p.x + p.y) / 3.4) - 0.5) * 3.4))",
    "  + (1.0 - smoothstep(0.0, 0.05, abs(fract((p.x - p.y) / 3.4) - 0.5) * 3.4));",
    "float bloom = pow(max(0.0, sin(ang * 6.2831853 * 5.0 + uTime * 0.35)), 8.0) * exp(-abs(r - 7.2) * 0.85);",
    "st = rake * 0.3 + lat * 0.13;",
    "hi = bloom * 1.1 + rake * 0.15;"
  ],
  gears: [
    "float teeth = step(0.52, fract(ang * 28.0 + uSpin * 2.4));",
    "float ringA = 1.0 - smoothstep(0.0, 0.12, abs(r - 4.3));",
    "float ringB = 1.0 - smoothstep(0.0, 0.1, abs(r - 7.2));",
    "float ringC = 1.0 - smoothstep(0.0, 0.09, abs(r - 10.6));",
    "float toothed = (ringA + ringB * 0.9 + ringC * 0.75) * mix(0.4, 1.0, teeth);",
    "float spoke = 1.0 - smoothstep(0.0, 0.06, abs(fract(ang * 8.0 - uSpin * 1.3) - 0.5) * (6.2831853 / 8.0) * r);",
    "st = toothed * 0.38 + spoke * 0.2;",
    "hi = toothed * teeth * 0.7;"
  ],
  hearth: [
    // Floorboards with staggered seams and a fire's warmth pooled at center.
    "float row = floor(p.y / 1.5);",
    "float plank = 1.0 - smoothstep(0.0, 0.08, abs(fract(p.y / 1.5) - 0.5) * 1.5);",
    "float seam = 1.0 - smoothstep(0.0, 0.06, abs(fract((p.x + row * 0.8) / 3.2) - 0.5) * 3.2);",
    "float warm = exp(-r * 0.14) * (0.62 + 0.38 * sin(uTime * 0.75));",
    "st = plank * 0.2 + seam * 0.14 + warm * 0.34;",
    "hi = warm * 0.6;"
  ],
  street: [
    // Wet blacktop: lane dashes, a long oily sheen down the crown of the road,
    // and rain rings spreading through the reflection.
    "float lane = 1.0 - smoothstep(0.0, 0.06, abs(fract(p.x / 3.6) - 0.5) * 3.6);",
    "float dash = lane * step(0.5, fract(p.y / 2.2 + uTime * 0.14));",
    "float sheen = pow(max(0.0, sin(p.y * 0.3 + uTime * 0.45)), 6.0) * (0.35 + 0.65 * exp(-abs(p.x) * 0.09));",
    "float d1 = fract(uTime * 0.62);",
    "float d2 = fract(uTime * 0.62 + 0.5);",
    "float rings = exp(-abs(r - d1 * 7.5) * 5.5) * (1.0 - d1) + exp(-abs(r - 3.5 - d2 * 7.5) * 5.5) * (1.0 - d2);",
    "st = dash * 0.3 + sheen * 0.28;",
    "hi = rings * 0.55 + sheen * 0.45;"
  ]
};

/**
 * The foundation's fragment shader, specialized to one ground mode. The
 * transient tail (kick swell / snare crack / hat shimmer) is identical for
 * every mode so the whole set still answers the drum kit the same way.
 */
export function groundFragment(mode: GroundMode): string {
  return [
    "varying vec2 vUv;",
    "uniform float uTime; uniform float uSpin; uniform float uEnergy; uniform float uFade;",
    "uniform float uPulseR; uniform float uPulseA;",
    "uniform float uCrackR; uniform float uCrackA; uniform float uShimmer;",
    "uniform vec3 uColorA; uniform vec3 uColorB; uniform vec3 uColorHot;",
    "void main() {",
    "  vec2 p = (vUv - 0.5) * 40.0;",
    "  float r = length(p);",
    "  float ang = atan(p.y, p.x) / 6.2831853;",
    "  float st = 0.0;",
    "  float hi = 0.0;",
    ...GROUND_BODY[mode].map((line) => `  ${line}`),
    // The kick's wave: wide skirt, soft edges — a swell you feel.
    "  float pulse = exp(-abs(r - uPulseR) * 1.6) * uPulseA;",
    // The snare's crack: a third the width, so it reads as a separate event.
    "  float crack = exp(-abs(r - uCrackR) * 5.2) * uCrackA;",
    "  float shimmer = uShimmer * (0.5 + 0.5 * sin(r * 7.3 - uTime * 9.0 + ang * 18.0)) * exp(-r * 0.26);",
    "  float falloff = exp(-r * 0.17);",
    "  float glow = (st + hi * 0.45) * falloff + (pulse * 0.7 + crack * 0.85 + shimmer * 0.3) * falloff;",
    "  vec3 col = mix(uColorB, uColorA, clamp(st * 1.6 + pulse, 0.0, 1.0));",
    "  col = mix(col, uColorHot, clamp(hi * 0.8 + crack * 1.4 + shimmer * 0.5, 0.0, 1.0));",
    "  float a = glow * uEnergy * uFade;",
    "  gl_FragColor = vec4(col * a, a);",
    "}"
  ].join("\n");
}

/* ── the ritual figure inside the inscription ─────────────────────────────── */

export type FigureKind =
  | "ring"
  | "pentacle"
  | "hexagram"
  | "circuitDie"
  | "compass"
  | "gear"
  | "mandala"
  | "burst"
  | "deco";

export const SIGIL_FIGURE: Record<ThemeKey, FigureKind> = {
  none: "ring",
  fantasy: "pentacle",
  scifi: "circuitDie",
  horror: "hexagram",
  noir: "deco",
  modern: "circuitDie",
  western: "compass",
  postapoc: "gear",
  cyberpunk: "circuitDie",
  spaceopera: "burst",
  gothic: "hexagram",
  urbanfantasy: "pentacle",
  steampunk: "gear",
  pirate: "compass",
  eastasian: "mandala",
  superhero: "burst",
  pulp: "compass",
  cozy: "mandala"
};

const TAU = Math.PI * 2;

/**
 * Paint the genre's magic circle into a canvas texture. Drawn once at build
 * time; the shader that samples it supplies all the animation, so this costs
 * nothing per frame.
 */
export function makeSigilFigureTexture(kind: FigureKind, accent: string, hot: string): THREE.CanvasTexture {
  const S = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  const c = S / 2;
  ctx.translate(c, c);
  ctx.lineCap = "round";
  ctx.strokeStyle = accent;
  ctx.shadowColor = hot;

  const circle = (radius: number, width: number, alpha: number) => {
    ctx.beginPath();
    ctx.arc(0, 0, radius * c, 0, TAU);
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = width * 3;
    ctx.stroke();
  };
  const poly = (radius: number, sides: number, step: number, rotation: number, width: number, alpha: number) => {
    ctx.beginPath();
    for (let i = 0; i <= sides; i += 1) {
      const a = rotation + ((i * step) / sides) * TAU;
      const x = Math.cos(a) * radius * c;
      const y = Math.sin(a) * radius * c;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = width * 3;
    ctx.stroke();
  };
  const spokes = (n: number, r0: number, r1: number, rotation: number, width: number, alpha: number) => {
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = width * 3;
    for (let i = 0; i < n; i += 1) {
      const a = rotation + (i / n) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0 * c, Math.sin(a) * r0 * c);
      ctx.lineTo(Math.cos(a) * r1 * c, Math.sin(a) * r1 * c);
      ctx.stroke();
    }
  };

  switch (kind) {
    case "pentacle":
      // Unicursal five-point star inside a double warding ring.
      circle(0.94, 5, 0.5);
      circle(0.88, 3, 0.85);
      poly(0.86, 5, 2, -Math.PI / 2, 7, 0.95);
      circle(0.4, 3, 0.5);
      spokes(5, 0.4, 0.86, -Math.PI / 2, 2, 0.3);
      break;
    case "hexagram":
      // Two interlocked triangles — a binding, not a blessing.
      circle(0.95, 4, 0.45);
      poly(0.86, 3, 1, -Math.PI / 2, 8, 0.9);
      poly(0.86, 3, 1, Math.PI / 2, 8, 0.9);
      circle(0.52, 3, 0.6);
      circle(0.2, 6, 0.8);
      break;
    case "circuitDie":
      // A die shot: nested pads, bus rails, and bond wires to the edge.
      circle(0.95, 3, 0.4);
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 6;
      ctx.shadowBlur = 14;
      for (const s of [0.78, 0.5, 0.26]) {
        ctx.beginPath();
        ctx.rect(-s * c, -s * c, s * 2 * c, s * 2 * c);
        ctx.stroke();
      }
      spokes(16, 0.78, 0.95, 0, 4, 0.55);
      spokes(4, 0.26, 0.5, Math.PI / 4, 5, 0.7);
      break;
    case "compass":
      // A compass rose: cardinal lances, half-winds, and a bearing collar.
      circle(0.95, 4, 0.45);
      circle(0.9, 2, 0.8);
      circle(0.34, 3, 0.7);
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * TAU - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a - 0.1) * 0.3 * c, Math.sin(a - 0.1) * 0.3 * c);
        ctx.lineTo(Math.cos(a) * 0.9 * c, Math.sin(a) * 0.9 * c);
        ctx.lineTo(Math.cos(a + 0.1) * 0.3 * c, Math.sin(a + 0.1) * 0.3 * c);
        ctx.closePath();
        ctx.lineWidth = 5;
        ctx.globalAlpha = 0.95;
        ctx.shadowBlur = 16;
        ctx.stroke();
      }
      spokes(4, 0.2, 0.72, Math.PI / 4, 4, 0.5);
      spokes(32, 0.84, 0.9, 0, 3, 0.4);
      break;
    case "gear":
      // A crown wheel: toothed rim, hub, and six lightening holes.
      circle(0.94, 5, 0.55);
      circle(0.8, 4, 0.75);
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.85;
      ctx.shadowBlur = 14;
      for (let i = 0; i < 24; i += 1) {
        const a0 = (i / 24) * TAU;
        const a1 = a0 + TAU / 48;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a0) * 0.8 * c, Math.sin(a0) * 0.8 * c);
        ctx.lineTo(Math.cos(a0) * 0.94 * c, Math.sin(a0) * 0.94 * c);
        ctx.lineTo(Math.cos(a1) * 0.94 * c, Math.sin(a1) * 0.94 * c);
        ctx.lineTo(Math.cos(a1) * 0.8 * c, Math.sin(a1) * 0.8 * c);
        ctx.stroke();
      }
      circle(0.24, 6, 0.9);
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 0.52 * c, Math.sin(a) * 0.52 * c, 0.13 * c, 0, TAU);
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.7;
        ctx.stroke();
      }
      break;
    case "mandala":
      // Lotus: three courses of petals turning against each other.
      circle(0.95, 3, 0.4);
      for (const [radius, petals, phase, alpha] of [
        [0.88, 16, 0, 0.75],
        [0.62, 12, Math.PI / 12, 0.6],
        [0.36, 8, 0, 0.8]
      ] as Array<[number, number, number, number]>) {
        ctx.lineWidth = 4;
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 12;
        for (let i = 0; i < petals; i += 1) {
          const a = phase + (i / petals) * TAU;
          const half = TAU / petals / 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a - half) * radius * 0.55 * c, Math.sin(a - half) * radius * 0.55 * c);
          ctx.quadraticCurveTo(
            Math.cos(a) * radius * 1.14 * c,
            Math.sin(a) * radius * 1.14 * c,
            Math.cos(a + half) * radius * 0.55 * c,
            Math.sin(a + half) * radius * 0.55 * c
          );
          ctx.stroke();
        }
      }
      circle(0.12, 5, 0.9);
      break;
    case "burst":
      // A heraldic starburst — long lances, short lances, and an oath ring.
      circle(0.95, 4, 0.4);
      circle(0.3, 6, 0.85);
      ctx.lineWidth = 7;
      ctx.globalAlpha = 0.9;
      ctx.shadowBlur = 20;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - 0.06) * 0.3 * c, Math.sin(a - 0.06) * 0.3 * c);
        ctx.lineTo(Math.cos(a) * 0.92 * c, Math.sin(a) * 0.92 * c);
        ctx.lineTo(Math.cos(a + 0.06) * 0.3 * c, Math.sin(a + 0.06) * 0.3 * c);
        ctx.stroke();
      }
      spokes(16, 0.34, 0.6, TAU / 32, 4, 0.5);
      break;
    case "deco":
      // Art-deco fan: stepped chevrons and a sunburst collar.
      circle(0.95, 5, 0.45);
      for (let ring = 0; ring < 3; ring += 1) {
        const radius = 0.86 - ring * 0.2;
        ctx.lineWidth = 6 - ring;
        ctx.globalAlpha = 0.8 - ring * 0.14;
        ctx.shadowBlur = 14;
        for (let i = 0; i < 12; i += 1) {
          const a = (i / 12) * TAU + ring * (TAU / 24);
          const half = TAU / 12 / 2.4;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a - half) * radius * c, Math.sin(a - half) * radius * c);
          ctx.lineTo(Math.cos(a) * (radius - 0.12) * c, Math.sin(a) * (radius - 0.12) * c);
          ctx.lineTo(Math.cos(a + half) * radius * c, Math.sin(a + half) * radius * c);
          ctx.stroke();
        }
      }
      spokes(24, 0.1, 0.28, 0, 3, 0.6);
      break;
    default:
      circle(0.94, 5, 0.6);
      circle(0.72, 3, 0.45);
      circle(0.42, 3, 0.45);
      spokes(24, 0.42, 0.94, 0, 2, 0.35);
      break;
  }

  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ── inhabitants ──────────────────────────────────────────────────────────── */

export type InhabitKind = "duel" | "brawl" | "patrol" | "rite" | "forge" | "revel" | "vigil";

export type InhabitSpec = {
  kind: InhabitKind;
  count: number;
  /** Plateau radius they occupy. Landmarks live inside ~2.6. */
  radius: number;
};

export const INHABIT: Record<ThemeKey, InhabitSpec> = {
  none: { kind: "patrol", count: 3, radius: 3.5 },
  // Knights at sword practice on the terrace, plus a walking watch.
  fantasy: { kind: "duel", count: 4, radius: 3.4 },
  // Troopers walking a perimeter under the mast.
  scifi: { kind: "patrol", count: 4, radius: 3.6 },
  // A hooded circle at rite. They do not move much. That is the point.
  horror: { kind: "rite", count: 6, radius: 3.2 },
  // Two figures in a standoff nobody is going to walk away from.
  noir: { kind: "duel", count: 2, radius: 3.3 },
  modern: { kind: "patrol", count: 4, radius: 3.6 },
  // Gunslingers: the draw lands on the snare.
  western: { kind: "duel", count: 2, radius: 3.4 },
  // Salvagers breaking scrap down by hand.
  postapoc: { kind: "forge", count: 4, radius: 3.4 },
  // A street brawl in the neon.
  cyberpunk: { kind: "brawl", count: 5, radius: 3.3 },
  // An honor guard holding the line of the processional.
  spaceopera: { kind: "vigil", count: 6, radius: 3.5 },
  // A funeral procession that never reaches the door.
  gothic: { kind: "rite", count: 6, radius: 3.3 },
  urbanfantasy: { kind: "duel", count: 4, radius: 3.4 },
  // Engineers at the anvil, hammering on the downbeat.
  steampunk: { kind: "forge", count: 4, radius: 3.4 },
  // A boarding action across the deck.
  pirate: { kind: "brawl", count: 6, radius: 3.4 },
  // Two swordsmen at kata, and it is not decorative.
  eastasian: { kind: "duel", count: 2, radius: 3.3 },
  superhero: { kind: "duel", count: 4, radius: 3.5 },
  pulp: { kind: "patrol", count: 3, radius: 3.5 },
  // Somebody put music on.
  cozy: { kind: "revel", count: 5, radius: 3.0 }
};

/** Joints: hip, neck, head, elbowL, handL, elbowR, handR, kneeL, footL, kneeR, footR. */
const J = 11;
const SEGS = 13;
const HEAD_R = 0.045;

type Actor = {
  /** Home position on the plateau. */
  x: number;
  z: number;
  facing: number;
  phase: number;
  /** 0..1 lunge/strike envelope, fired by a transient and decaying out. */
  strike: number;
  cooldown: number;
  /** Walkers advance along their ring. */
  travel: number;
};

export type Inhabitants = {
  object: THREE.Object3D;
  /**
   * @param show 0..1 presence (they fade in once the island is solid)
   * @param hit  0..1 the transient this genre fights on (usually the snare)
   * @param beat 0..1 the low-end transient (hammer blows, stomps)
   */
  update: (t: number, dt: number, show: number, hit: number, beat: number, level: number) => void;
  dispose: () => void;
};

/**
 * Build the island's population. One LineSegments carries every figure, and a
 * single Points carries their weapon sparks, so the whole living crowd is two
 * draw calls.
 */
export function createInhabitants(
  spec: InhabitSpec,
  visual: ThemeVisual,
  sparkTexture: THREE.Texture,
  groundY: number
): Inhabitants {
  const group = new THREE.Group();
  const count = spec.count;
  const actors: Actor[] = [];

  for (let i = 0; i < count; i += 1) {
    let x = 0;
    let z = 0;
    let facing = 0;
    if (spec.kind === "duel") {
      // Pairs squared off against each other, each pair on its own bearing.
      const pair = Math.floor(i / 2);
      const pairs = Math.max(1, Math.ceil(count / 2));
      const bearing = (pair / pairs) * TAU + 0.4;
      const cx = Math.cos(bearing) * spec.radius;
      const cz = Math.sin(bearing) * spec.radius;
      // The two of them stand off along the tangent, facing one another.
      const side = i % 2 === 0 ? 1 : -1;
      const tangent = bearing + Math.PI / 2;
      x = cx + Math.cos(tangent) * 0.34 * side;
      z = cz + Math.sin(tangent) * 0.34 * side;
      facing = side > 0 ? tangent + Math.PI : tangent;
    } else if (spec.kind === "brawl") {
      // A scrum: everyone crowded in, all facing the middle of it.
      const bearing = (i / count) * TAU + 0.7;
      const jitter = 0.72 + ((i * 37) % 11) / 40;
      const cx = Math.cos(0.9) * spec.radius;
      const cz = Math.sin(0.9) * spec.radius;
      x = cx + Math.cos(bearing) * jitter;
      z = cz + Math.sin(bearing) * jitter;
      facing = Math.atan2(cz - z, cx - x);
    } else {
      const bearing = (i / count) * TAU;
      x = Math.cos(bearing) * spec.radius;
      z = Math.sin(bearing) * spec.radius;
      // Rites and vigils face the worldheart; walkers face their path.
      facing = spec.kind === "patrol" ? bearing + Math.PI / 2 : Math.atan2(-z, -x);
    }
    actors.push({
      x,
      z,
      facing,
      phase: (i * 2.399963) % TAU,
      strike: 0,
      cooldown: (i % 3) * 0.18,
      travel: (i / count) * TAU
    });
  }

  const positions = new Float32Array(count * SEGS * 2 * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(visual.accentBright),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const lines = new THREE.LineSegments(geometry, material);
  group.add(lines);

  // Weapon sparks: one mote per actor, parked below the floor when idle.
  const sparkPositions = new Float32Array(count * 3).fill(-100);
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
  const sparkMaterial = new THREE.PointsMaterial({
    map: sparkTexture,
    color: new THREE.Color(visual.accentBright),
    size: 0.3,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  group.add(sparks);

  const joints = new Float32Array(J * 3);
  const set = (index: number, forward: number, up: number, side: number) => {
    joints[index * 3] = forward;
    joints[index * 3 + 1] = up;
    joints[index * 3 + 2] = side;
  };

  /** Neutral stance, so every pose only has to override what it changes. */
  const stand = (bob: number) => {
    set(0, 0, 0.3 + bob, 0);
    set(1, 0.01, 0.47 + bob, 0);
    set(2, 0.015, 0.545 + bob, 0);
    set(3, -0.02, 0.38 + bob, 0.072);
    set(4, -0.03, 0.29 + bob, 0.082);
    set(5, -0.02, 0.38 + bob, -0.072);
    set(6, -0.03, 0.29 + bob, -0.082);
    set(7, 0.02, 0.16, 0.055);
    set(8, 0.02, 0, 0.055);
    set(9, -0.02, 0.16, -0.055);
    set(10, -0.02, 0, -0.055);
  };

  const poseWalk = (t: number, phase: number, speed: number) => {
    const c = t * speed + phase;
    const a = Math.sin(c);
    const b = Math.sin(c + Math.PI);
    stand(Math.abs(a) * 0.012);
    set(3, b * 0.1, 0.37, 0.072);
    set(4, b * 0.18, 0.27, 0.082);
    set(5, a * 0.1, 0.37, -0.072);
    set(6, a * 0.18, 0.27, -0.082);
    set(7, a * 0.09, 0.16, 0.055);
    set(8, a * 0.17, Math.max(0, a) * 0.05, 0.055);
    set(9, b * 0.09, 0.16, -0.055);
    set(10, b * 0.17, Math.max(0, b) * 0.05, -0.055);
  };

  const poseStrike = (t: number, phase: number, k: number) => {
    // k 0 → weapon cocked high; k 1 → committed, blade thrown forward.
    const bob = Math.sin(t * 2.1 + phase) * 0.008;
    const lean = k * 0.15;
    stand(bob);
    set(0, lean * 0.5, 0.3 + bob - k * 0.03, 0);
    set(1, lean, 0.46 + bob - k * 0.02, 0);
    set(2, lean * 1.2, 0.542 + bob - k * 0.02, 0);
    set(5, 0.05 + k * 0.13, 0.5 - k * 0.11, -0.07);
    set(6, 0.03 + k * 0.33, 0.68 - k * 0.45, -0.07);
    set(3, -0.05 - k * 0.02, 0.39, 0.075);
    set(4, -0.12 - k * 0.05, 0.31, 0.088);
    set(7, 0.1 + k * 0.12, 0.15, 0.06);
    set(8, 0.19 + k * 0.16, 0, 0.06);
    set(9, -0.11, 0.15, -0.06);
    set(10, -0.2, 0, -0.06);
  };

  const poseRite = (t: number, phase: number, lift: number) => {
    // Hooded, head bowed, arms rising with the crescendo.
    const sway = Math.sin(t * 0.55 + phase) * 0.02;
    stand(Math.sin(t * 0.7 + phase) * 0.006);
    set(1, sway, 0.46, 0);
    set(2, sway + 0.03, 0.535, 0);
    const up = 0.42 + lift * 0.26;
    set(3, 0.03, up, 0.09);
    set(4, 0.06 + lift * 0.04, up + 0.12 + lift * 0.1, 0.13);
    set(5, 0.03, up, -0.09);
    set(6, 0.06 + lift * 0.04, up + 0.12 + lift * 0.1, -0.13);
    set(7, 0.01, 0.16, 0.05);
    set(8, 0.01, 0, 0.05);
    set(9, -0.01, 0.16, -0.05);
    set(10, -0.01, 0, -0.05);
  };

  const poseForge = (t: number, phase: number, k: number) => {
    // Both hands on the hammer; it falls on the beat.
    const bob = Math.sin(t * 1.8 + phase) * 0.006;
    stand(bob);
    set(0, 0.03, 0.29 + bob, 0);
    set(1, 0.06, 0.45 + bob, 0);
    set(2, 0.09, 0.525 + bob, 0);
    const hy = 0.62 - k * 0.44;
    const hf = 0.1 + k * 0.24;
    set(3, 0.08, 0.42, 0.06);
    set(4, hf, hy, 0.045);
    set(5, 0.08, 0.42, -0.06);
    set(6, hf, hy, -0.045);
    set(7, 0.08, 0.15, 0.06);
    set(8, 0.12, 0, 0.06);
    set(9, -0.08, 0.15, -0.06);
    set(10, -0.12, 0, -0.06);
  };

  const poseRevel = (t: number, phase: number, energy: number) => {
    // Weight shifting side to side, arms loose and up.
    const s = Math.sin(t * 1.9 + phase);
    const c = Math.cos(t * 1.9 + phase);
    stand(Math.abs(s) * 0.02);
    set(0, 0, 0.3 + Math.abs(s) * 0.02, s * 0.04);
    set(1, 0, 0.47, s * 0.05);
    set(2, 0.01, 0.545, s * 0.06);
    set(3, 0.04, 0.5 + c * 0.05, 0.11);
    set(4, 0.07, 0.6 + c * 0.09 + energy * 0.04, 0.15);
    set(5, 0.04, 0.5 - c * 0.05, -0.11);
    set(6, 0.07, 0.6 - c * 0.09 + energy * 0.04, -0.15);
    set(7, 0, 0.16, 0.055 + s * 0.02);
    set(8, 0, 0, 0.06 + s * 0.03);
    set(9, 0, 0.16, -0.055 + s * 0.02);
    set(10, 0, 0, -0.06 + s * 0.03);
  };

  const poseVigil = (t: number, phase: number) => {
    // Statue-still, spear grounded. Only the light moves on them.
    stand(Math.sin(t * 0.4 + phase) * 0.003);
    set(3, 0.05, 0.42, 0.075);
    set(4, 0.06, 0.32, 0.085);
    set(5, 0.06, 0.46, -0.075);
    set(6, 0.07, 0.7, -0.08);
    set(7, 0.01, 0.16, 0.05);
    set(8, 0.01, 0, 0.05);
    set(9, -0.01, 0.16, -0.05);
    set(10, -0.01, 0, -0.05);
  };

  const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
  const sparkAttr = sparkGeometry.getAttribute("position") as THREE.BufferAttribute;
  const bones: Array<[number, number]> = [
    [0, 1],
    [1, 3],
    [3, 4],
    [1, 5],
    [5, 6],
    [0, 7],
    [7, 8],
    [0, 9],
    [9, 10]
  ];

  let shown = 0;

  return {
    object: group,
    update: (t, dt, show, hit, beat, level) => {
      shown += (show - shown) * Math.min(1, dt * 2.4);
      material.opacity = shown * (0.5 + level * 0.35);
      if (shown < 0.01) {
        sparkMaterial.opacity = 0;
        return;
      }
      // Which transient this crowd answers: fighters read the snare, smiths
      // and stompers read the kick, the rest just breathe.
      const trigger = spec.kind === "forge" ? beat : hit;
      let sparkPeak = 0;

      for (let i = 0; i < count; i += 1) {
        const actor = actors[i];
        actor.cooldown -= dt;
        // A hit commits the figure — but only if it has recovered, so the
        // action reads as deliberate blows rather than a vibrating blur.
        if (trigger > 0.3 && actor.cooldown <= 0) {
          actor.strike = 1;
          actor.cooldown = 0.26 + (i % 4) * 0.07;
        }
        actor.strike = Math.max(0, actor.strike - dt * 3.4);
        const k = 1 - (1 - actor.strike) * (1 - actor.strike);

        let baseX = actor.x;
        let baseZ = actor.z;
        let facing = actor.facing;

        switch (spec.kind) {
          case "patrol": {
            actor.travel += dt * 0.19 * (0.7 + level * 0.6);
            baseX = Math.cos(actor.travel) * spec.radius;
            baseZ = Math.sin(actor.travel) * spec.radius;
            facing = actor.travel + Math.PI / 2;
            poseWalk(t, actor.phase, 7.5 * (0.7 + level * 0.6));
            break;
          }
          case "duel":
          case "brawl": {
            poseStrike(t, actor.phase, k);
            // The lunge carries them forward off the mark and back.
            baseX += Math.cos(facing) * k * 0.16;
            baseZ += Math.sin(facing) * k * 0.16;
            break;
          }
          case "forge": {
            poseForge(t, actor.phase, k);
            break;
          }
          case "rite": {
            poseRite(t, actor.phase, level * 0.5 + hit * 0.5);
            break;
          }
          case "revel": {
            poseRevel(t, actor.phase, level);
            break;
          }
          default: {
            poseVigil(t, actor.phase);
            break;
          }
        }

        const cf = Math.cos(facing);
        const sf = Math.sin(facing);
        const wx = (f: number, s: number) => baseX + f * cf - s * sf;
        const wz = (f: number, s: number) => baseZ + f * sf + s * cf;
        const base = i * SEGS * 2;

        bones.forEach(([a, b], boneIndex) => {
          const af = joints[a * 3];
          const au = joints[a * 3 + 1];
          const as = joints[a * 3 + 2];
          const bf = joints[b * 3];
          const bu = joints[b * 3 + 1];
          const bs = joints[b * 3 + 2];
          attr.setXYZ(base + boneIndex * 2, wx(af, as), groundY + au, wz(af, as));
          attr.setXYZ(base + boneIndex * 2 + 1, wx(bf, bs), groundY + bu, wz(bf, bs));
        });

        // Head as a small diamond, so it reads as a silhouette not a dot.
        const hf = joints[2 * 3];
        const hu = joints[2 * 3 + 1];
        const hs = joints[2 * 3 + 2];
        const ring: Array<[number, number]> = [
          [hf, hu + HEAD_R],
          [hf + HEAD_R, hu],
          [hf, hu - HEAD_R],
          [hf - HEAD_R, hu]
        ];
        for (let e = 0; e < 4; e += 1) {
          const [f0, u0] = ring[e];
          const [f1, u1] = ring[(e + 1) % 4];
          const o = base + bones.length * 2 + e * 2;
          attr.setXYZ(o, wx(f0, hs), groundY + u0, wz(f0, hs));
          attr.setXYZ(o + 1, wx(f1, hs), groundY + u1, wz(f1, hs));
        }

        // The spark rides the weapon hand at the moment of contact.
        const showSpark = (spec.kind === "duel" || spec.kind === "brawl" || spec.kind === "forge") && actor.strike > 0.15;
        if (showSpark) {
          const gf = joints[6 * 3];
          const gu = joints[6 * 3 + 1];
          const gs = joints[6 * 3 + 2];
          sparkAttr.setXYZ(i, wx(gf, gs), groundY + gu, wz(gf, gs));
          sparkPeak = Math.max(sparkPeak, actor.strike);
        } else {
          sparkAttr.setXYZ(i, 0, -100, 0);
        }
      }

      attr.needsUpdate = true;
      sparkAttr.needsUpdate = true;
      sparkMaterial.opacity = shown * sparkPeak * 0.9;
      sparkMaterial.size = 0.22 + sparkPeak * 0.2;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
      sparkGeometry.dispose();
      sparkMaterial.dispose();
    }
  };
}
