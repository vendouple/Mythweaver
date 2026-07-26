"use client";

import * as THREE from "three";
import type { ThemeKey, ThemeVisual } from "./themeVisuals";

/**
 * Signature ground, ritual circle, and inhabitants.
 *
 * The Weaving used to give every genre the same holographic floor, the same
 * glyph ring, and an island with nobody on it. Three things fixed here:
 *
 *   GROUND     â€” the foundation plane gets a per-genre surface. Pirate worlds
 *                are built over a luminous SEA (moving swell, caustics, foam);
 *                cyberpunk over a live circuit board; gothic over cathedral
 *                tracery; horror over throbbing veins; the frontier over
 *                cracked hardpan; steampunk over turning gearwork. The floor
 *                is the largest surface on screen, so this is the single
 *                biggest change to how a theme reads.
 *   FIGURE     â€” a genre-specific magic circle (pentacle, hexagram, compass
 *                rose, circuit die, gear, lotus mandala, deco fanâ€¦) ignites
 *                inside the inscription as the weave charges.
 *   INHABITANTSâ€” the island is no longer empty. Tiny luminous figures live on
 *                the plateau and act out the genre: duellists trading blows on
 *                the SNARE, a hooded circle at rite, smiths hammering on the
 *                KICK, a patrol walking the rim, statues standing vigil.
 *
 * Everything here is line-art and one-shader cheap: no textures loaded, no
 * extra draw calls beyond one plane, one disc, and one LineSegments.
 */

/* â”€â”€ ground surfaces â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

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
    // mesh where the two wave trains interfere â€” the classic sunlit-shallows
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
    // A scalloped outer arcade â€” the pointed arches of a nave, seen in plan.
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
    // The kick's wave: wide skirt, soft edges â€” a swell you feel.
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

/* â”€â”€ the ritual figure inside the inscription â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

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
      // Two interlocked triangles â€” a binding, not a blessing.
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
      // A heraldic starburst â€” long lances, short lances, and an oath ring.
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

/* ── flanking relics ──────────────────────────────────────────────────────── */

/**
 * Big themed silhouettes that hang at the LEFT AND RIGHT EDGES of the frame.
 *
 * The composition's problem was that everything lived in the middle third: the
 * island, the sigil, the heart. The outer thirds were empty sky, which reads as
 * an unfinished shot no matter how good the center is. These fill them —
 * monoliths, hull sections, cathedral arches, wrecked signage, ships' ribs —
 * hanging far out, slowly turning, catching the light on a crescendo.
 *
 * They are deliberately NOT the signature prop (that's one hero object with its
 * own animation). These are set dressing at scale: one shared wireframe drawn
 * six times, placed to bracket the frame rather than to be looked at.
 */
export type RelicKind =
  | "monolith"
  | "arch"
  | "hull"
  | "billboard"
  | "rib"
  | "gear"
  | "totem"
  | "lantern"
  | "crag";

export const EDGE_RELIC: Record<ThemeKey, RelicKind> = {
  none: "monolith",
  // Ruined arcane arches, still standing where the wall isn't.
  fantasy: "arch",
  // Hull sections off something that broke up in orbit.
  scifi: "hull",
  horror: "monolith",
  // Dead signage from the block over.
  noir: "billboard",
  modern: "billboard",
  // Weathered totems on the ridgeline.
  western: "totem",
  postapoc: "rib",
  cyberpunk: "billboard",
  spaceopera: "hull",
  gothic: "arch",
  urbanfantasy: "monolith",
  steampunk: "gear",
  // Ships' ribs — the frames of hulls that never got finished.
  pirate: "rib",
  // Paper lanterns strung between crags.
  eastasian: "lantern",
  superhero: "hull",
  pulp: "crag",
  cozy: "lantern"
};

/** Build one relic's wireframe. Kept coarse — these are read as silhouettes. */
function relicGeometry(kind: RelicKind): THREE.BufferGeometry {
  const group = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];
  const add = (geometry: THREE.BufferGeometry, position?: [number, number, number], rotation?: [number, number, number]) => {
    const mesh = new THREE.Mesh(geometry);
    if (position) mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    group.add(mesh);
    parts.push(geometry);
  };

  switch (kind) {
    case "monolith":
      // A leaning slab with a smaller shard beside it.
      add(new THREE.BoxGeometry(1.1, 5.2, 0.7), [0, 0, 0], [0, 0.3, 0.07]);
      add(new THREE.BoxGeometry(0.5, 2.3, 0.4), [1.1, -1.3, 0.4], [0, 0.8, -0.16]);
      break;
    case "arch":
      // A pointed arch on two piers, the way a nave wall survives a fire.
      add(new THREE.CylinderGeometry(0.22, 0.3, 3.6, 6), [-1.3, -0.9, 0]);
      add(new THREE.CylinderGeometry(0.22, 0.3, 3.6, 6), [1.3, -0.9, 0]);
      add(new THREE.TorusGeometry(1.3, 0.2, 5, 14, Math.PI), [0, 0.9, 0]);
      add(new THREE.ConeGeometry(0.3, 1.0, 4), [0, 2.4, 0]);
      break;
    case "hull":
      // A curved plate with frame ribs and a stub of spar.
      add(new THREE.CylinderGeometry(2.0, 1.7, 3.4, 9, 1, true), [0, 0, 0], [0.2, 0, 0.4]);
      add(new THREE.TorusGeometry(1.85, 0.1, 4, 12), [0, 1.4, 0], [Math.PI / 2, 0, 0]);
      add(new THREE.BoxGeometry(0.3, 0.3, 3.0), [1.4, -1.0, 0], [0, 0.3, 0.5]);
      break;
    case "billboard":
      // A hoarding frame with its panel half gone and a support truss.
      add(new THREE.BoxGeometry(4.2, 2.4, 0.12));
      add(new THREE.BoxGeometry(4.5, 0.16, 0.3), [0, 1.3, 0]);
      add(new THREE.BoxGeometry(4.5, 0.16, 0.3), [0, -1.3, 0]);
      add(new THREE.CylinderGeometry(0.14, 0.14, 3.4, 5), [0, -3.0, 0]);
      add(new THREE.BoxGeometry(0.1, 2.9, 0.1), [-1.4, -0.05, 0.2], [0, 0, 0.4]);
      break;
    case "rib":
      // A keel with frames standing off it — a hull that never got planked.
      add(new THREE.CylinderGeometry(0.16, 0.24, 5.4, 5), [0, 0, 0], [0, 0, Math.PI / 2]);
      for (let i = 0; i < 5; i += 1) {
        const s = 1 - Math.abs(i - 2) * 0.22;
        add(
          new THREE.TorusGeometry(1.5 * s, 0.09, 4, 10, Math.PI * 1.1),
          [(i - 2) * 1.1, 0.9 * s, 0],
          [0, Math.PI / 2, 0]
        );
      }
      break;
    case "gear":
      // A dead gear train: two wheels still meshed, one shaft.
      add(new THREE.TorusGeometry(1.7, 0.22, 5, 11), [0, 0, 0]);
      add(new THREE.TorusGeometry(0.95, 0.18, 5, 9), [2.3, -0.9, 0]);
      for (let i = 0; i < 6; i += 1) {
        add(new THREE.BoxGeometry(3.3, 0.14, 0.14), [0, 0, 0], [0, 0, (i / 6) * Math.PI]);
      }
      add(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 5), [0, 0, 0], [Math.PI / 2, 0, 0]);
      break;
    case "totem":
      // Stacked carved blocks on a post, a wing board at the top.
      add(new THREE.CylinderGeometry(0.3, 0.36, 4.4, 5));
      for (let i = 0; i < 3; i += 1) {
        add(new THREE.BoxGeometry(0.9 - i * 0.14, 0.7, 0.9 - i * 0.14), [0, -1.2 + i * 1.1, 0], [0, i * 0.5, 0]);
      }
      add(new THREE.BoxGeometry(2.4, 0.14, 0.5), [0, 2.1, 0], [0, 0, 0.1]);
      break;
    case "lantern":
      // A string of paper lanterns dropping off a broken spar.
      add(new THREE.CylinderGeometry(0.06, 0.06, 4.6, 4), [0, 0, 0], [0, 0, Math.PI / 2.2]);
      for (let i = 0; i < 4; i += 1) {
        const x = -1.7 + i * 1.15;
        const drop = -0.7 - Math.abs(i - 1.5) * 0.3;
        add(new THREE.CylinderGeometry(0.42, 0.42, 0.7, 8), [x, drop, 0]);
        add(new THREE.TorusGeometry(0.44, 0.04, 4, 12), [x, drop + 0.35, 0], [Math.PI / 2, 0, 0]);
        add(new THREE.TorusGeometry(0.44, 0.04, 4, 12), [x, drop - 0.35, 0], [Math.PI / 2, 0, 0]);
      }
      break;
    default:
      // A crag: stacked rock masses, no straight lines anywhere.
      add(new THREE.IcosahedronGeometry(1.7, 0), [0, -0.8, 0]);
      add(new THREE.IcosahedronGeometry(1.1, 0), [0.7, 1.2, -0.3]);
      add(new THREE.ConeGeometry(0.9, 2.4, 5), [0.2, 2.6, 0]);
      break;
  }

  // Flatten to one wireframe in the group's local space, then throw the
  // primitives away — from this distance only the edges register anyway.
  group.updateMatrixWorld(true);
  const chunks: number[] = [];
  const v = new THREE.Vector3();
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const edges = new THREE.EdgesGeometry(child.geometry as THREE.BufferGeometry, 18);
    const position = edges.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i += 1) {
      v.fromBufferAttribute(position, i);
      child.localToWorld(v);
      group.worldToLocal(v);
      chunks.push(v.x, v.y, v.z);
    }
    edges.dispose();
  });
  for (const part of parts) part.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(chunks), 3));
  return geometry;
}

export type EdgeRelics = {
  object: THREE.Object3D;
  /**
   * @param show  0..1 overall presence
   * @param swell 0..1 crescendo — the relics catch the light on it
   */
  update: (t: number, dt: number, show: number, swell: number, level: number) => void;
  dispose: () => void;
};

export function createEdgeRelics(visual: ThemeVisual, rand: () => number): EdgeRelics {
  const group = new THREE.Group();
  const geometry = relicGeometry(EDGE_RELIC[visual.key] || EDGE_RELIC.none);
  const disposables: Array<{ dispose: () => void }> = [geometry];

  // Three per side. The camera orbits, so "the edge of frame" is a RADIUS and a
  // HEIGHT rather than a fixed screen position: parked far out and spread in
  // height, they sweep through the outer thirds as the shot turns, and because
  // they're beyond the armillary they never tangle with the rings.
  const SIDES = [1, -1];
  const items: Array<{
    line: THREE.LineSegments;
    material: THREE.LineBasicMaterial;
    angle: number;
    radius: number;
    y: number;
    spin: number;
    tumble: number;
    scale: number;
    phase: number;
  }> = [];

  for (const side of SIDES) {
    for (let i = 0; i < 3; i += 1) {
      const material = new THREE.LineBasicMaterial({
        color: new THREE.Color(i === 1 ? visual.secondary : visual.accent),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const line = new THREE.LineSegments(geometry, material);
      group.add(line);
      disposables.push(material);
      items.push({
        line,
        material,
        // Clustered off the camera's two flanks (±90°) rather than evenly
        // around, so they actually land in the outer thirds of the shot.
        angle: side * (Math.PI / 2) + (i - 1) * 0.42 + rand() * 0.2,
        radius: 15 + i * 3.4 + rand() * 2.5,
        y: 1.5 + i * 3.6 + rand() * 2,
        spin: (0.012 + rand() * 0.02) * (rand() > 0.5 ? 1 : -1),
        tumble: 0.1 + rand() * 0.2,
        scale: 1.5 + rand() * 1.3,
        phase: rand() * TAU
      });
    }
  }

  return {
    object: group,
    update: (t, dt, show, swell, level) => {
      for (const item of items) {
        // A very slow drift around the world, plus a lazy tumble in place.
        const angle = item.angle + t * 0.008;
        item.line.position.set(
          Math.cos(angle) * item.radius,
          item.y + Math.sin(t * 0.18 + item.phase) * 0.7,
          Math.sin(angle) * item.radius
        );
        item.line.rotation.y = t * item.spin * 6 + item.phase;
        item.line.rotation.z = Math.sin(t * 0.13 + item.phase) * item.tumble;
        // Scale up slightly on a crescendo, so the frame's edges breathe with
        // the score instead of the center doing all the work.
        const s = item.scale * (1 + swell * 0.04);
        item.line.scale.setScalar(s);
        const target = show * (0.1 + level * 0.05 + swell * 0.14);
        item.material.opacity += (target - item.material.opacity) * Math.min(1, dt * 2);
      }
    },
    dispose: () => {
      for (const item of disposables) item.dispose();
    }
  };
}

