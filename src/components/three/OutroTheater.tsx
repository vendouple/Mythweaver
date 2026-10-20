"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { CampaignEnding, EndingCastMember, EndingKind, EndingStat, Player } from "@/lib/campaign/types";
import { accentColor } from "@/lib/client/api";
import { createMusicPulse } from "@/lib/client/musicPulse";
import { themeVisual, ThemeKey } from "@/components/three/themeVisuals";
import { createWorldBackdrop, type BackdropFrame } from "@/components/three/worldBackdrop";
import { createLandmark } from "@/components/three/landmarks";
import { createD20, createIsland } from "@/components/three/forgeWorld";
import { FLAVOR, ISLAND_Y } from "@/components/three/WorldForge";
import {
  TAU,
  approach,
  clamp01,
  createParticles,
  createRingPool,
  createTracker,
  glowSprite,
  glowTexture,
  hashString,
  lerp,
  mulberry32,
  raysTexture,
  shapeAtlasTexture,
  smooth,
  streakTexture
} from "@/components/three/sceneKit";

/**
 * THE WORLD'S FATE
 * ================
 * Act three of the arc. The lobby showed the island in pieces under a dark
 * D20; the Weaving forged it — the die slammed a 20 and the landmark came
 * alive. The finale returns to that exact world (same island, same landmark,
 * same woven sky, same die) and the die ROLLS ITS FATE:
 *
 *   victory      — THE DAWN.       The die lands on 20 and turns to gold. A
 *                                  sun climbs behind the island, the stone
 *                                  gilds, every window burns, and fireworks
 *                                  of the genre's own sparks break on the
 *                                  kick.
 *   defeat       — THE FALL.       A natural 1. The die cracks with ember
 *                                  seams, the landmark's pieces calve off,
 *                                  the island's sectors break away and drop
 *                                  into the dark, ash falls, the sky chars.
 *   bittersweet  — THE HALF-LIGHT. An 11: the island splits on a seam of
 *                                  light. The east half gilds under a sun,
 *                                  the west half greys, cracks and falls.
 *   escape       — THE LEAVING.    The die never stops spinning; the whole
 *                                  world draws back and away down a tunnel
 *                                  of streaking light until it is one star.
 *   draw         — THE STILLNESS.  The die comes to rest on a POINT — an
 *                                  impossible balance — and everything
 *                                  freezes mid-motion, glazed in frost, a
 *                                  level beam of light across the island.
 *   cliffhanger  — THE CRACK.      The die will not settle: it glitches
 *                                  between numbers as a rift tears open
 *                                  behind the island. Hard cut, mid-tremor.
 *
 * Every theme gets its own landmark, sky, plateau, reveal and particle shape
 * for free (landmarks.ts, worldBackdrop.ts, forgeWorld.ts), and the music
 * pulse drives the hits: fireworks, tremors, glitches, the beam's breath.
 *
 * Engineering rules carried over, still load-bearing:
 *   · ONE CLOCK. The render loop owns the beat index; skip is a seek.
 *   · The picture comes FIRST: a widescreen crop, not a letterbox slot.
 *   · ONE text block at a time in one fixed band; variable content is
 *     time-sliced, never stacked.
 *   · READABILITY IS STRUCTURAL: during the reading beats the world steps
 *     aside and dims and a scrim backs the band.
 *   · Terminal events RESOLVE into a frame that can hold for twenty minutes.
 *   · The CPU eases ~25 scalar targets; everything else is scene graph.
 *   · The reel scrubs BOTH ways; the scripts are stateless per frame, so the
 *     world always matches wherever the needle drops.
 */

/* ------------------------------------------------------------------ */
/* The score                                                           */
/* ------------------------------------------------------------------ */

type BeatId =
  | "strike"
  | "loom"
  | "kind"
  | "title"
  | "epilogue"
  | "chronicle"
  | "ledger"
  | "cast"
  | "fin"
  | "hold";

type Beat = { id: BeatId; seconds: number };

/** Fixed spine; reading beats scale with their content (see the reel memo). */
const SCORE: Beat[] = [
  { id: "strike", seconds: 2.8 },
  { id: "loom", seconds: 5.6 },
  { id: "kind", seconds: 3.4 },
  { id: "title", seconds: 6.2 },
  { id: "epilogue", seconds: 6.4 },
  { id: "chronicle", seconds: 6.6 },
  { id: "ledger", seconds: 5.0 },
  { id: "cast", seconds: 10.5 },
  { id: "fin", seconds: 5.6 },
  { id: "hold", seconds: Infinity }
];

/**
 * Reading time is COUNTED, not guessed: a beat that puts text on screen gets
 * a base (fade in, settle, fade out) plus the characters it actually shows at
 * a deliberate credits pace, clamped so empty cards don't blink and epics
 * don't stall the reel.
 */
const READ_CPS = 13; // characters per second, cinematic pace
const readSeconds = (text: string, base: number, min: number, max: number) =>
  Math.min(max, Math.max(min, base + text.length / READ_CPS));

/** Separator for the text keys the reading tables memoise on (see the reel). */
const UNIT = "␟";
const splitKey = (key: string) => (key ? key.split(UNIT) : []);

/** Per-line durations → one total plus cumulative cut fractions for slicing. */
const readingCuts = (texts: string[], base: number, min: number, max: number) => {
  const durations = texts.map((text) => readSeconds(text, base, min, max));
  const total = durations.reduce((sum, d) => sum + d, 0);
  const cuts: number[] = [];
  let acc = 0;
  for (const duration of durations) {
    acc += duration;
    cuts.push(total > 0 ? acc / total : 1);
  }
  return { total, cuts };
};

/**
 * Everything the choreography can push, per frame. The render loop eases the
 * live values toward these targets, so the scripts write intent and the
 * smoothing layer supplies the cinematography.
 */
type Targets = {
  presence: number; // world opacity 0..1 (the loom fade-in)
  kindle: number; //   worldheart glow
  dawn: number; //     sunrise sweep 0..1 (victory / bittersweet)
  ruin: number; //     landmark-shedding cascade 0..1
  divide: number; //   restrict dawn AND ruin to opposite sides (bittersweet)
  recede: number; //   the world leaves 0..1 (escape)
  still: number; //    spin damp 0..1 (draw freezes at 1)
  leak: number; //     wrong light under the plateau (cliffhanger)
  shake: number; //    tremor amplitude (defeat's first crack, the leak's throb)
  veil: number; //     world dim while words own the frame
  aside: number; //    world steps to the upper-right for the reading beats
  focus: number; //    cast: the worldheart takes the hero's colour
  flash: number;
  black: number;
  glow: number;
  exposure: number;
  burst: number; //    event motes (embers up, ash down, sparks sideways)
  desat: number;
  tintAmt: number;
  gate: number; //     letterbox aperture
  jitter: number; //   gate jump in px
  bloom: number; //    halation strength (the whole frame blooms)
  gild: number; //     victory: the stone itself takes the gold
  ash: number; //      defeat: ashfall, ember-stone, the maw below
  frost: number; //    draw: vitrification — the world goes to cold glass
  rift: number; //     cliffhanger: the tear behind the world opens
};

const TARGET_KEYS: (keyof Targets)[] = [
  "presence", "kindle", "dawn", "ruin", "divide", "recede", "still", "leak", "shake",
  "veil", "aside", "focus", "flash", "black", "glow", "exposure", "burst", "desat",
  "tintAmt", "gate", "jitter", "bloom", "gild", "ash", "frost", "rift"
];

/** Per-key easing speed; higher = snappier. Cuts are fast, grades are slow. */
const RATES: Partial<Record<keyof Targets, number>> = {
  flash: 11, black: 8, jitter: 24, shake: 10, kindle: 4, ruin: 2.4, gate: 4.2,
  burst: 4, focus: 5, presence: 2.4, exposure: 3.4, recede: 1.6, aside: 2.6, veil: 3,
  bloom: 3.2, gild: 2.2, ash: 2, frost: 1.8, rift: 2.6
};
const DEFAULT_RATE = 2.8;

type Ctx = {
  id: BeatId;
  p: number; //        0..1 through the current beat
  hump: number; //     peaks ~40% through fin, gone by ~85% — strike then settle
  settled: boolean;
  through: number; //  0..1 through the whole reel up to fin
  t: number;
};

type Movement = {
  label: string;
  /** Fallback caption for the world's fate when the saga did not write one. */
  loomLine: string;
  fin: string;
  /** Card crossfade seconds. 0 = every transition is a hard cut (defeat). */
  dissolve: number;
  /**
   * Aperture = the fraction of frame height that is PICTURE. These are
   * widescreen crops (~0.74–0.86 ≈ 2.4:1 … 2.1:1 on a 16:9 panel), not the
   * old half-frame slot — the world is the point, and it was being mailed
   * through a letterbox.
   */
  aperture: number;
  apertureHold: number;
  tint: string;
  burstDir: [number, number];
  script: (ctx: Ctx, T: Targets) => void;
};

const MOVEMENTS: Record<EndingKind | "generic", Movement> = {
  victory: {
    label: "Victory",
    loomLine: "The world they fought for still stands.",
    fin: "FIN",
    dissolve: 0.8,
    aperture: 0.78,
    apertureHold: 0.84,
    tint: "#ffd27a",
    burstDir: [0, 1.1],
    script: (ctx, T) => {
      switch (ctx.id) {
        case "loom":
          T.dawn = ctx.p * 0.08; // a rumour of light before the verdict
          break;
        case "kind":
          T.dawn = 0.08 + ctx.p * 0.24; // first light breaks the horizon
          T.gild = ctx.p * 0.34;
          T.bloom = 1 + ctx.p * 0.25;
          if (ctx.p < 0.1) T.flash = 0.24;
          break;
        case "title":
          T.dawn = 0.36;
          T.gild = 0.46;
          T.glow = 0.34;
          T.bloom = 1.35;
          break;
        case "epilogue":
        case "chronicle":
        case "ledger":
        case "cast":
          // The saved world stays LIT under the credits — the dawn is the
          // whole point of this ending, not a stinger at the end of it.
          T.dawn = 0.4;
          T.gild = 0.52;
          T.bloom = 1.2;
          break;
        case "fin":
          T.dawn = 0.4 + ctx.p * 0.6; //  the sun clears the island
          T.gild = 0.52 + ctx.p * 0.48;
          T.kindle = 1 + ctx.hump * 0.9;
          T.burst = ctx.hump;
          T.exposure = 1 + ctx.hump * 0.55;
          T.flash = Math.pow(ctx.hump, 1.6) * 0.7;
          T.glow = 0.45;
          T.bloom = 1.35 + ctx.hump * 1.5;
          T.gate = 0.78 + ctx.p * 0.06;
          break;
        case "hold":
          T.dawn = 1;
          T.gild = 1;
          T.kindle = 1.25;
          T.burst = 0.18;
          T.exposure = 1.06;
          T.glow = 0.3;
          T.bloom = 1.75;
          break;
      }
    }
  },
  defeat: {
    label: "Defeat",
    loomLine: "The world could not be held.",
    fin: "FIN",
    dissolve: 0,
    aperture: 0.74,
    apertureHold: 0.66,
    tint: "#5d6b80",
    burstDir: [0, -0.85],
    script: (ctx, T) => {
      // The world is already losing pieces while the credits roll — and it is
      // already raining ash on them.
      T.ruin = ctx.through * 0.34;
      T.ash = 0.22 + ctx.through * 0.48;
      T.desat = 0.2 + ctx.through * 0.3;
      T.kindle = 1 - ctx.through * 0.5;
      T.bloom = 0.8;
      switch (ctx.id) {
        case "strike":
        case "loom":
          T.ash = ctx.id === "loom" ? ctx.p * 0.22 : 0;
          T.ruin = 0;
          break;
        case "kind":
          T.exposure = 0.84;
          if (ctx.p < 0.25) T.shake = 0.55; // the first crack, felt not seen
          break;
        case "fin": {
          T.ruin = 0.34 + ctx.p * 0.66;
          T.ash = 0.7 + ctx.p * 0.3;
          T.shake = ctx.hump * 0.55;
          T.exposure = 0.84 * (1 - ctx.p * 0.42);
          T.burst = ctx.hump * 0.9;
          T.kindle = 0.5 - ctx.p * 0.26;
          T.bloom = 0.7 + ctx.hump * 0.7;
          T.gate = 0.74 - ctx.p * 0.08;
          break;
        }
        case "hold":
          T.ruin = 1;
          T.ash = 1;
          // Dark, but not unreadable — the last frame has to hold for twenty
          // minutes and the audience should still be able to see what is left.
          T.exposure = 0.66;
          T.burst = 0.12;
          T.desat = 0.5;
          T.kindle = 0.3; // the worldheart never quite dies
          T.bloom = 0.8;
          break;
      }
    }
  },
  bittersweet: {
    label: "Bittersweet",
    loomLine: "Half the world was saved.",
    fin: "FIN",
    dissolve: 1.3,
    aperture: 0.76,
    apertureHold: 0.8,
    tint: "#c99a86",
    burstDir: [0, 0.9],
    script: (ctx, T) => {
      const arrived = ctx.id === "strike" || ctx.id === "loom" ? 0 : 1;
      // The line is drawn on the verdict and never moves again — and once it
      // is drawn the world stops turning, so the two fates keep their sides.
      T.divide = ctx.id === "kind" ? Math.pow(ctx.p, 0.7) : arrived;
      T.dawn = arrived * 0.34;
      T.gild = arrived * 0.4; // only the +x half takes it (the material gates it)
      T.ruin = arrived * 0.09; // the cold half is already flaking away
      T.ash = arrived * 0.3;
      T.bloom = 1 + arrived * 0.15;
      switch (ctx.id) {
        case "fin":
          T.dawn = 0.34 + ctx.p * 0.56; // dawn on one side…
          T.ruin = 0.09 + ctx.p * 0.66; // …the fall on the other
          T.ash = 0.3 + ctx.p * 0.5;
          T.gild = 0.4 + ctx.p * 0.6;
          T.burst = ctx.hump * 0.55;
          T.glow = 0.26;
          T.kindle = 1 + ctx.hump * 0.45;
          T.flash = Math.pow(ctx.hump, 2) * 0.22;
          T.bloom = 1.15 + ctx.hump * 0.9;
          break;
        case "hold":
          T.dawn = 0.92;
          T.ruin = 0.75;
          T.ash = 0.8;
          T.gild = 1;
          T.burst = 0.16;
          T.kindle = 0.82;
          T.bloom = 1.3;
          break;
      }
    }
  },
  escape: {
    label: "Escape",
    loomLine: "They left the world behind.",
    fin: "FIN",
    dissolve: 0.35,
    aperture: 0.74,
    apertureHold: 0.86,
    tint: "#7ad0e0",
    burstDir: [1.5, 0.1],
    script: (ctx, T) => {
      T.bloom = 1.05;
      switch (ctx.id) {
        case "kind":
          T.recede = 0.05; // the ground already pulling away underfoot
          break;
        case "title":
        case "epilogue":
        case "chronicle":
        case "ledger":
        case "cast":
          T.recede = 0.09; // the whole reel is shot from something moving
          break;
        case "fin":
          T.recede = 0.09 + Math.pow(ctx.p, 1.35) * 0.91;
          T.burst = ctx.hump;
          T.flash = Math.pow(ctx.hump, 2.4) * 0.35;
          T.kindle = 1 + ctx.p * 0.1; // the heart burns brightest at distance
          T.bloom = 1.05 + Math.pow(ctx.p, 1.6) * 0.5;
          T.gate = 0.74 + ctx.p * 0.12;
          break;
        case "hold":
          T.recede = 1; // one bright star among the stars
          T.kindle = 1.1;
          T.burst = 0.1;
          T.exposure = 1.02;
          T.bloom = 1.5;
          break;
      }
    }
  },
  draw: {
    label: "Stalemate",
    loomLine: "The world holds its breath.",
    fin: "THE SCALES REST EVEN",
    dissolve: 0.7,
    aperture: 0.76,
    apertureHold: 0.76,
    tint: "#aab2c0",
    burstDir: [0, 0],
    script: (ctx, T) => {
      const engaged = ctx.id === "strike" || ctx.id === "loom" ? 0 : 1;
      T.still = engaged * 0.42; //   the turn is already slowing
      T.frost = engaged * 0.34; //   and the stone is already going to glass
      T.desat = engaged * 0.2;
      T.bloom = 0.9;
      switch (ctx.id) {
        case "kind":
          T.still = ctx.p * 0.42;
          T.frost = ctx.p * 0.34;
          T.desat = ctx.p * 0.2;
          break;
        case "fin":
          T.still = 0.42 + ctx.p * 0.58; // …to a complete stop
          T.frost = 0.34 + ctx.p * 0.66;
          T.exposure = 0.97;
          T.bloom = 0.9 + ctx.hump * 0.5;
          break;
        case "hold":
          T.still = 1; // frozen mid-turn, debris hanging in the air
          T.frost = 1;
          T.exposure = 0.97;
          T.bloom = 1.05;
          break;
      }
    }
  },
  cliffhanger: {
    label: "To Be Continued",
    loomLine: "The world is not finished with them.",
    fin: "TO BE CONTINUED",
    dissolve: 0.5,
    aperture: 0.74,
    apertureHold: 0.62,
    tint: "#9a6ae0",
    burstDir: [0.6, 0.35],
    script: (ctx, T) => {
      const unease = ctx.id === "strike" || ctx.id === "loom" ? 0 : 1;
      T.leak = unease * 0.24; // something under the plateau is glowing
      T.rift = unease * 0.14; // and something behind it has already started
      T.bloom = 1 + unease * 0.15;
      switch (ctx.id) {
        case "kind":
          T.leak = ctx.p * 0.24;
          T.rift = ctx.p * 0.14;
          break;
        case "fin": {
          T.leak = 0.24 + Math.pow(ctx.p, 1.4) * 0.76;
          T.rift = 0.14 + Math.pow(ctx.p, 1.2) * 0.86;
          T.shake = ctx.p > 0.5 ? (ctx.p - 0.5) * 0.9 : 0;
          if (!ctx.settled && ctx.p > 0.45) T.jitter = (Math.sin(ctx.t * 37) > 0.55 ? 1 : 0) * 5 * ctx.p;
          if (ctx.p > 0.94) T.black = 1; // hard cut, mid-tremor
          T.glow = 0.15;
          T.bloom = 1.2 + ctx.p * 0.9;
          break;
        }
        case "hold":
          // Not black: the island in silhouette, the rift still burning,
          // the world still turning. It is not done.
          T.black = 0.3;
          T.exposure = 0.62;
          T.leak = 1;
          T.rift = 1;
          T.shake = (ctx.t % 7) < 0.12 ? 0.35 : 0;
          T.glow = 0.2;
          T.bloom = 1.6;
          break;
      }
    }
  },
  generic: {
    label: "The Tale Ends",
    loomLine: "The world turns on without them.",
    fin: "FIN",
    dissolve: 0.8,
    aperture: 0.76,
    apertureHold: 0.78,
    tint: "#c9b98a",
    burstDir: [0, 0.4],
    script: (ctx, T) => {
      T.bloom = 1;
      if (ctx.id === "fin") {
        T.glow = 0.3;
        T.black = Math.pow(ctx.p, 2) * 0.3;
      } else if (ctx.id === "hold") {
        T.black = 0.3;
        T.glow = 0.2;
      }
    }
  }
};

/* ------------------------------------------------------------------ */
/* Per-theme grade & fate                                              */
/* ------------------------------------------------------------------ */

type Garnish = {
  gutter: number; //  irregular exposure gutter (candles, failing reactors)
  mono: number; //    baseline desaturation
};

const GARNISH: Record<ThemeKey, Garnish> = {
  none: { gutter: 0, mono: 0 },
  fantasy: { gutter: 0, mono: 0 },
  scifi: { gutter: 0, mono: 0 },
  horror: { gutter: 0.7, mono: 0.1 },
  noir: { gutter: 0.15, mono: 0.4 },
  modern: { gutter: 0, mono: 0 },
  western: { gutter: 0.12, mono: 0 },
  postapoc: { gutter: 0.3, mono: 0.08 },
  cyberpunk: { gutter: 0.2, mono: 0 },
  spaceopera: { gutter: 0, mono: 0 },
  gothic: { gutter: 0.5, mono: 0.08 },
  urbanfantasy: { gutter: 0.1, mono: 0 },
  steampunk: { gutter: 0.25, mono: 0 },
  pirate: { gutter: 0.18, mono: 0 },
  eastasian: { gutter: 0.05, mono: 0 },
  superhero: { gutter: 0, mono: 0 },
  pulp: { gutter: 0.1, mono: 0.1 },
  cozy: { gutter: 0.15, mono: 0 }
};

/** What the die shows when it lands. null = it never settles. */
const FATE: Record<EndingKind | "generic", number | null> = {
  victory: 20,
  defeat: 1,
  bittersweet: 11,
  escape: null,
  draw: null,
  cliffhanger: null,
  generic: 10
};

const LENS_FRAG = `
uniform sampler2D tDiffuse;
uniform float uExposure;
uniform float uDesat;
uniform vec3 uTint;
uniform float uTintAmt;
uniform float uFlash;
uniform float uBlack;
uniform float uGlow;
uniform vec2 uGlowCenter;
uniform float uAspect;
uniform float uTime;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb * uExposure;
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  c = mix(c, vec3(l), clamp(uDesat, 0.0, 1.0));
  c = mix(c, c * uTint * 1.5, uTintAmt * 0.22);
  float d = length((vUv - uGlowCenter) * vec2(uAspect, 1.0));
  c += uTint * uGlow * exp(-d * 2.6) * 0.25;
  float vig = smoothstep(1.3, 0.35, length((vUv - 0.5) * vec2(uAspect * 0.85, 1.0)));
  c *= mix(1.0, vig, 0.5);
  c += vec3(uFlash);
  c += (hash(vUv * 977.0 + fract(uTime)) - 0.5) * 0.02;
  c *= 1.0 - clamp(uBlack, 0.0, 1.0);
  gl_FragColor = vec4(max(c, 0.0), 1.0);
}`;

const RIFT_FRAG = `
uniform float uOpen;
uniform float uTime;
uniform vec3 uColor;
varying vec2 vUv;
float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise(float x) { float i = floor(x); float f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main() {
  float y = vUv.y;
  float center = 0.5 + (noise(y * 9.0) - 0.5) * 0.12 + (noise(y * 31.0 + 4.0) - 0.5) * 0.04;
  float taper = smoothstep(0.0, 0.25, y) * smoothstep(1.0, 0.7, y);
  float width = uOpen * 0.07 * taper * (0.7 + 0.3 * noise(y * 14.0 + uTime * 2.0));
  float d = abs(vUv.x - center);
  float core = smoothstep(width, width * 0.2, d);
  float halo = exp(-d / (0.02 + width * 2.5)) * uOpen * taper;
  vec3 col = mix(uColor, vec3(1.0), core) * (core * 1.6 + halo * 0.8);
  float a = clamp(core + halo * 0.7, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}`;

/** The backdrop + world, drawn into the composer's read buffer. */
class StagePass extends Pass {
  private draw: (target: THREE.WebGLRenderTarget) => void;
  constructor(draw: (target: THREE.WebGLRenderTarget) => void) {
    super();
    this.draw = draw;
    this.needsSwap = false;
  }
  render(_renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    this.draw(read);
  }
}

export default function OutroTheater({
  ending,
  players,
  campaignTitle,
  theme,
  onExit
}: {
  ending: CampaignEnding;
  players: Player[];
  campaignTitle: string;
  theme?: ThemeKey | string | null;
  onExit?: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const kind: EndingKind | "generic" = MOVEMENTS[ending.kind] ? ending.kind : "generic";
  const movement = MOVEMENTS[kind];
  const kindLabel =
    kind === "generic" && ending.kind
      ? String(ending.kind).replace(/\b\w/g, (c) => c.toUpperCase())
      : movement.label;
  const visual = themeVisual(theme);
  const garnish = GARNISH[visual.key] || GARNISH.none;
  // The saga's own line about what became of the world, when the DM wrote one
  // — the per-kind fallback is true of every victory and so about none of them.
  const fateLine = (ending.worldFate || "").trim() || movement.loomLine;

  const [beatIndex, setBeatIndex] = useState(0);
  // Sub-beat progress, only used to slice variable content (which highlight,
  // which hero). Updated a few times per beat, never per frame.
  const [slice, setSlice] = useState(0);
  const seekRef = useRef<((target: number) => void) | null>(null);

  const highlights = useMemo(() => (ending.highlights || []).slice(0, 6), [ending.highlights]);
  const stats: EndingStat[] = useMemo(() => (ending.stats || []).slice(0, 6), [ending.stats]);

  /** AI cast lines matched back to live players, so a credit can carry a face. */
  const castByPlayer = useMemo(() => {
    const map = new Map<string, EndingCastMember>();
    for (const member of ending.cast || []) {
      const match = players.find(
        (p) =>
          (member.playerId && p.id === member.playerId) ||
          (member.name &&
            [p.characterName || "", p.name].some((n) => n && n.toLowerCase() === member.name!.toLowerCase()))
      );
      if (match && !map.has(match.id)) map.set(match.id, member);
    }
    return map;
  }, [ending.cast, players]);

  // Reading beats are timed by the characters they actually put on screen —
  // long fates hold, short quips move on, empty sections vanish outright
  // (a blank card reads as a bug).
  //
  // THE REEL MUST BE KEYED ON TEXT, NEVER ON ARRAY IDENTITY. The stage polls
  // every few seconds and hands this component a freshly-parsed campaign, so
  // `players`/`ending.cast`/`ending.highlights` are new objects holding the
  // same words. Memoising on those identities churned `reel`, which the world
  // effect depends on — the finale rebuilt its WebGL scene and restarted its
  // clock every poll, freezing on the first beat forever. Strings compare by
  // value, so these tables only change when the words actually change.
  const chronicleKey = highlights.join(UNIT);
  const castKey = players
    .map((player) => {
      const member = castByPlayer.get(player.id);
      return [player.characterName || player.name, member?.title || "", member?.fate || ""].join(" ");
    })
    .join(UNIT);

  const chronicleCuts = useMemo(() => readingCuts(splitKey(chronicleKey), 1.7, 3.4, 7.5), [chronicleKey]);
  const castCuts = useMemo(() => readingCuts(splitKey(castKey), 2.3, 4, 8.5), [castKey]);

  const reel = useMemo(() => {
    return SCORE.filter((beat) => {
      if (beat.id === "chronicle") return highlights.length > 0;
      if (beat.id === "ledger") return stats.length > 0;
      if (beat.id === "cast") return players.length > 0;
      return true;
    }).map((beat) => {
      if (beat.id === "loom") return { ...beat, seconds: readSeconds(fateLine, 3.4, 5, 10) };
      if (beat.id === "title") return { ...beat, seconds: readSeconds(ending.title || "", 4.2, 5.5, 9.5) };
      if (beat.id === "epilogue") return { ...beat, seconds: readSeconds(ending.summary || "", 2.6, 6, 14) };
      if (beat.id === "chronicle") return { ...beat, seconds: Math.max(4.5, chronicleCuts.total) };
      if (beat.id === "ledger") return { ...beat, seconds: Math.min(8, Math.max(4.5, 3 + stats.length * 0.8)) };
      if (beat.id === "cast") return { ...beat, seconds: Math.max(4, castCuts.total) };
      // FIN has to outlast its epitaph, or the reel cuts to the hold mid-line.
      if (beat.id === "fin") return { ...beat, seconds: readSeconds(ending.epitaph || "", 5.6, 5.6, 11) };
      return beat;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlights.length, stats.length, players.length, ending.summary, ending.title, ending.epitaph, fateLine, chronicleCuts, castCuts]);

  const beat = reel[Math.min(beatIndex, reel.length - 1)] || reel[reel.length - 1];
  const beatId = beat?.id || "hold";

  const advance = useCallback(() => {
    seekRef.current?.(beatIndex + 1);
  }, [beatIndex]);

  /** The reel scrubs both ways — a step back replays the previous beat. */
  const retreat = useCallback(() => {
    seekRef.current?.(beatIndex - 1);
  }, [beatIndex]);

  const restart = useCallback(() => {
    seekRef.current?.(0);
  }, []);

  const skipToEnd = useCallback(() => {
    seekRef.current?.(reel.length - 1);
  }, [reel.length]);

  /* ---------------- The world ---------------- */
  useEffect(() => {
    const mount = mountRef.current;
    const root = rootRef.current;
    if (!mount || !root) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tracker = createTracker();
    const rand = mulberry32(hashString(`${visual.key}-${kind}`));
    const flavor = FLAVOR[visual.key] || FLAVOR.none;
    const fate = FATE[kind];

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    // Bloom is a full extra pass; 2x on a 4K TV buys nothing it doesn't smear.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setClearColor(0x000000, 1);
    renderer.autoClear = false;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
    camera.position.set(0, 5.2, 23);
    scene.add(camera);
    const skyCamera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
    skyCamera.position.set(0, 0.4, 11);

    const accent = new THREE.Color(visual.accent);
    const bright = new THREE.Color(visual.accentBright);
    const secondary = new THREE.Color(visual.secondary);
    const white = new THREE.Color("#ffffff");
    const gold = new THREE.Color("#ffd27a").lerp(bright, 0.25);
    const ember = new THREE.Color("#ff5a24").lerp(accent, 0.15);
    const ashColor = new THREE.Color("#8a8580");
    const frostColor = new THREE.Color("#bcd4ee");
    const tint = new THREE.Color(movement.tint);
    const glow = tracker.track(glowTexture());
    const atlas = tracker.track(shapeAtlasTexture());
    const displayFont = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "serif";
    const shape = (["eastasian", "cozy"].includes(visual.key) ? 1
      : ["fantasy", "spaceopera"].includes(visual.key) ? 3
        : ["scifi", "cyberpunk", "modern"].includes(visual.key) ? 2 : 0) as 0 | 1 | 2 | 3;
    const petal = ["eastasian", "cozy", "fantasy"].includes(visual.key);

    /* -------- the woven sky -------- */
    const backdrop = createWorldBackdrop(visual);
    backdrop.uniforms.uVoidAlpha.value = 1;

    /* -------- light -------- */
    const ambient = new THREE.AmbientLight(new THREE.Color(visual.ambient), 0.7);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(new THREE.Color("#ffffff").lerp(bright, 0.3), 1.0);
    key.position.set(5, 9, 8);
    scene.add(key);
    const underLight = new THREE.PointLight(accent, 8, 30, 1.6);
    underLight.position.set(0, ISLAND_Y - 5, 2);
    scene.add(underLight);
    const sunLight = new THREE.PointLight(gold, 0, 80, 1.2);
    scene.add(sunLight);

    /* -------- the world: island, landmark, die -------- */
    const world = new THREE.Group();
    scene.add(world);
    const island = createIsland(visual, tracker, rand);
    island.group.position.y = ISLAND_Y;
    world.add(island.group);
    const landmark = createLandmark(visual, tracker, { glow, atlas }, { thick: true, ground: false });
    const lmScale = Math.min(0.95, 11.2 / landmark.width, 6.4 / landmark.height);
    landmark.group.scale.setScalar(lmScale);
    landmark.group.position.set(0, ISLAND_Y + 0.02, 0);
    world.add(landmark.group);
    const d20 = createD20(visual, tracker, 1.05, glow, displayFont);
    const D20_Y = ISLAND_Y + landmark.height * lmScale + 2.1;
    d20.group.position.set(0, D20_Y, 0);
    world.add(d20.group);

    // Fall order: who goes first when the world breaks. Under the half-light
    // only the west (x < 0) side ever goes.
    const chunkOrder = island.chunks.map(() => 0.05 + rand() * 0.55);
    const pieceOrder = landmark.pieces.map(() => 0.02 + rand() * 0.6);
    const chunkWest = island.chunks.map((c) => Math.sin(c.angle) < 0);
    const pieceWest = landmark.pieces.map((p) => p.cx < 0);
    const pieceSpin = landmark.pieces.map(() => (rand() - 0.5) * 3);

    /* -------- sun & rays (victory / bittersweet) -------- */
    const raysTex = tracker.track(raysTexture());
    const sun = glowSprite(tracker, glow, gold, 0);
    const rays = glowSprite(tracker, raysTex, gold, 0);
    sun.renderOrder = 1;
    rays.renderOrder = 1;
    scene.add(sun, rays);

    /* -------- the rift (cliffhanger) -------- */
    const riftUniforms = { uOpen: { value: 0 }, uTime: { value: 0 }, uColor: { value: secondary.clone().lerp(white, 0.15) } };
    const rift = new THREE.Mesh(
      tracker.track(new THREE.PlaneGeometry(16, 26)),
      tracker.track(new THREE.ShaderMaterial({
        uniforms: riftUniforms,
        vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: RIFT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }))
    );
    rift.position.set(0, ISLAND_Y + 3, -9);
    rift.renderOrder = 2;
    rift.visible = kind === "cliffhanger";
    scene.add(rift);

    /* -------- the level beam (draw) -------- */
    const streakTex = tracker.track(streakTexture());
    const beamMaterial = tracker.track(new THREE.MeshBasicMaterial({ map: streakTex, color: frostColor, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const beamGeometry = tracker.track(new THREE.PlaneGeometry(1, 1));
    const beams = [1, -1].map((dir) => {
      const mesh = new THREE.Mesh(beamGeometry, beamMaterial);
      mesh.scale.set(13, 0.16, 1);
      mesh.position.set(dir * 6.5, D20_Y - 0.2, 0.5);
      mesh.rotation.z = dir > 0 ? 0 : Math.PI;
      mesh.renderOrder = 22;
      scene.add(mesh);
      return mesh;
    });
    const weights = [-1, 1].map((dir) => {
      const s = glowSprite(tracker, glow, frostColor, 0);
      s.position.set(dir * 9, D20_Y - 0.2, 0.5);
      s.renderOrder = 23;
      scene.add(s);
      return s;
    });

    /* -------- the leaving's streaks (escape) -------- */
    const STREAKS = 220;
    const streakPositions = new Float32Array(STREAKS * 6);
    const streakSeeds = Array.from({ length: STREAKS }, () => [rand() * TAU, 1.5 + rand() * 9, rand() * 120, 0.6 + rand() * 1.4]);
    const streakGeometry = tracker.track(new THREE.BufferGeometry());
    streakGeometry.setAttribute("position", new THREE.BufferAttribute(streakPositions, 3));
    const streakMaterial = tracker.track(new THREE.LineBasicMaterial({ color: bright.clone().lerp(white, 0.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    const streaks = new THREE.LineSegments(streakGeometry, streakMaterial);
    streaks.frustumCulled = false;
    streaks.renderOrder = 24;
    streaks.visible = kind === "escape";
    camera.add(streaks);
    const streakAttr = streakGeometry.getAttribute("position") as THREE.BufferAttribute;
    const escapeStar = glowSprite(tracker, glow, bright, 0);
    escapeStar.renderOrder = 26;
    scene.add(escapeStar);

    /* -------- particles & rings -------- */
    const motes = createParticles(tracker, atlas, 1400);
    motes.points.renderOrder = 17;
    scene.add(motes.points);
    const rings = createRingPool(tracker, 10, 1.6);
    rings.group.children.forEach((child) => { child.renderOrder = 18; });
    scene.add(rings.group);

    /* -------- post: bloom + the lens grade -------- */
    const composer = new EffectComposer(renderer);
    const frameData: BackdropFrame = { t: 0, dt: 0, envelope: 1, drive: 1, pulse: undefined as unknown as BackdropFrame["pulse"] };
    composer.addPass(new StagePass((target) => {
      backdrop.render(renderer, skyCamera, frameData, target);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    }));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.45, 0.82);
    composer.addPass(bloomPass);
    const lensInit = {
      tDiffuse: { value: null as THREE.Texture | null },
      uExposure: { value: 1 },
      uDesat: { value: 0 },
      uTint: { value: tint.clone() },
      uTintAmt: { value: 0 },
      uFlash: { value: 0 },
      uBlack: { value: 1 },
      uGlow: { value: 0 },
      uGlowCenter: { value: new THREE.Vector2(0.5, 0.55) },
      uAspect: { value: 16 / 9 },
      uTime: { value: 0 }
    };
    const lensPass = new ShaderPass({
      uniforms: lensInit,
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: LENS_FRAG
    });
    composer.addPass(lensPass);
    // ShaderPass clones what it is given — drive the pass's own copies.
    const lensUniforms = lensPass.uniforms as unknown as typeof lensInit;
    composer.addPass(new OutputPass());
    const BLOOM_BASE = 0.5;

    const resize = () => {
      const w = Math.max(mount.clientWidth, 1);
      const h = Math.max(mount.clientHeight, 1);
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      skyCamera.aspect = w / h;
      skyCamera.updateProjectionMatrix();
      backdrop.setSize(w, h, renderer.getPixelRatio());
      lensUniforms.uAspect.value = w / h;
      const scale = (h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
      motes.setScale(scale);
      landmark.setPixelScale(scale * lmScale);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    /* -------- the single clock -------- */
    let frame = 0;
    let currentBeat = -1;
    let currentSlice = -1;
    let snapValues = false;
    const starts: number[] = [];
    {
      let acc = 0;
      for (const b of reel) {
        starts.push(acc);
        acc += b.seconds === Infinity ? 0 : b.seconds;
      }
    }
    const finStart = starts[Math.max(reel.findIndex((b) => b.id === "fin"), 0)] || 1;
    const kindIndex = Math.max(0, reel.findIndex((b) => b.id === "kind"));
    let timeOffset = 0;
    let clockNow = 0;

    seekRef.current = (target: number) => {
      const clamped = Math.max(0, Math.min(reel.length - 1, target));
      timeOffset = clockNow - starts[clamped];
      currentBeat = clamped;
      currentSlice = -1;
      snapValues = true;
      setBeatIndex(clamped);
      setSlice(0);
    };

    const sliceAt = (cuts: number[], progress: number) => {
      for (let i = 0; i < cuts.length; i += 1) if (progress < cuts[i]) return i;
      return Math.max(cuts.length - 1, 0);
    };
    const sliceFor = (id: BeatId, progress: number) => {
      if (id === "chronicle" && highlights.length) return sliceAt(chronicleCuts.cuts, progress);
      if (id === "cast" && players.length) return sliceAt(castCuts.cuts, progress);
      return 0;
    };

    /* -------- targets & smoothing -------- */
    const T: Targets = {
      presence: 1, kindle: 1, dawn: 0, ruin: 0, divide: 0, recede: 0, still: 0, leak: 0,
      shake: 0, veil: 0, aside: 0, focus: 0, flash: 0, black: 0, glow: 0.12, exposure: 1,
      burst: 0, desat: garnish.mono, tintAmt: 0, gate: movement.aperture, jitter: 0,
      bloom: 1, gild: 0, ash: 0, frost: 0, rift: 0
    };
    const cur: Targets = { ...T, presence: 0, kindle: 0, exposure: 0.5, black: 1, bloom: 0.4 };

    /** The spine every kind shares; movements overlay their own intent. */
    const spine = (ctx: Ctx) => {
      T.presence = 1; T.kindle = 1; T.dawn = 0; T.ruin = 0; T.divide = 0; T.recede = 0;
      T.still = 0; T.leak = 0; T.shake = 0; T.veil = 0; T.aside = 0; T.focus = 0;
      T.flash = 0; T.black = 0; T.glow = 0.12; T.exposure = 1; T.burst = 0;
      T.desat = garnish.mono; T.tintAmt = 0; T.gate = movement.aperture; T.jitter = 0;
      T.bloom = 1; T.gild = 0; T.ash = 0; T.frost = 0; T.rift = 0;
      switch (ctx.id) {
        case "strike":
          // Darkness, then the die kindles alone.
          T.presence = 0;
          T.kindle = Math.pow(ctx.p, 0.7) * 0.9;
          T.exposure = 0.75;
          T.gate = movement.aperture * (0.5 + 0.5 * Math.pow(ctx.p, 0.6));
          T.glow = 0.08;
          T.bloom = 0.8;
          break;
        case "loom":
          // The world is woven back into view around the die.
          T.presence = Math.min(1, ctx.p * 1.4);
          T.exposure = 0.95;
          break;
        case "kind":
          T.tintAmt = Math.min(1, ctx.p * 1.4) * 0.8;
          break;
        case "title":
          T.tintAmt = 0.8;
          T.veil = 0.28;
          T.glow = 0.28;
          break;
        case "epilogue":
        case "chronicle":
        case "ledger":
          T.tintAmt = 0.8;
          T.veil = 0.32;
          T.aside = 1;
          break;
        case "cast":
          T.tintAmt = 0.8;
          T.veil = 0.3;
          T.aside = 1;
          T.focus = 1;
          break;
        case "fin":
        case "hold":
          T.tintAmt = 0.8;
          T.gate = movement.apertureHold;
          break;
      }
    };

    /* -------- the frame -------- */
    const pulseReader = createMusicPulse();
    const heroColors = players.slice(0, 8).map((p) => new THREE.Color(accentColor(p.color)));
    const pose = new THREE.Vector3(0, 5.2, 23);
    const look = new THREE.Vector3(0, ISLAND_Y - 0.9, 0);
    const poseTarget = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();
    const diePos = new THREE.Vector3();
    const sunPos = new THREE.Vector3();
    const projected = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    let worldTime = 0; //  the world's own clock — the stalemate stops it dead
    let burstAcc = 0;
    let glitchFlash = 0;
    let cliffShow = 1;

    const firework = (x: number, y: number, z: number, scale: number) => {
      const colorA = rand() < 0.5 ? bright : gold;
      const colorB = rand() < 0.5 ? secondary : accent;
      rings.fire(x, y, z, 2.6 * scale, 0.55, colorA);
      if (reducedMotion) return;
      for (let k = 0; k < 70; k += 1) {
        const a = rand() * TAU;
        const e = (rand() - 0.5) * Math.PI;
        const sp = (2.5 + rand() * 2.5) * scale;
        motes.spawn({ x, y, z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp, vz: Math.sin(a) * Math.cos(e) * sp, life: 1.2 + rand() * 0.9, size: 0.08 + rand() * 0.06, color: rand() < 0.6 ? colorA : colorB, gravity: 1.2, drag: 1.4, shape, flutter: petal ? 0.4 : 0 });
      }
    };

    const renderFrame = (t: number, dt: number) => {
      clockNow = t;
      const reelTime = t - timeOffset;
      let index = 0;
      for (let i = 0; i < reel.length; i += 1) {
        const start = starts[i];
        const end = i + 1 < reel.length ? starts[i + 1] : Infinity;
        if (reelTime >= start && reelTime < end) { index = i; break; }
      }
      const id = reel[index].id;
      const span = reel[index].seconds;
      const progress = span === Infinity ? 0 : clamp01((reelTime - starts[index]) / span);
      if (index !== currentBeat) {
        currentBeat = index;
        setBeatIndex(index);
        currentSlice = -1;
      }
      const nextSlice = sliceFor(id, progress);
      if (nextSlice !== currentSlice) {
        currentSlice = nextSlice;
        setSlice(nextSlice);
      }
      const ctx: Ctx = {
        id,
        p: progress,
        hump: id === "fin" ? Math.sin(Math.min(progress * 1.15, 1) * Math.PI) : 0,
        settled: id === "hold",
        through: Math.min(1, reelTime / finStart),
        t
      };
      spine(ctx);
      movement.script(ctx, T);
      for (const keyName of TARGET_KEYS) {
        if (snapValues) cur[keyName] = T[keyName];
        else cur[keyName] += (T[keyName] - cur[keyName]) * approach(dt, RATES[keyName] ?? DEFAULT_RATE);
      }
      snapValues = false;

      const live = 1 - cur.still;
      const wdt = dt * live;
      worldTime += wdt;
      const wt = worldTime;
      const raw = pulseReader.read(dt, t);
      const react = live;
      const kick = raw.kick * flavor.kick * react;
      const snare = raw.snare * flavor.snare * react;
      const hat = raw.hat * flavor.hat * react;
      const swell = raw.swell * flavor.swell * react;
      const landed = currentBeat >= kindIndex && id !== "strike" && id !== "loom";

      let exposure = cur.exposure * (1 - cur.veil * 0.35);
      if (garnish.gutter > 0) {
        const flick = (Math.sin(t * 11.3) * 0.5 + 0.5) * (Math.sin(t * 2.7 + 1.3) * 0.5 + 0.5);
        exposure *= 1 - garnish.gutter * 0.12 * flick;
      }

      /* ---- the world leaves (escape) ---- */
      const rc = Math.pow(cur.recede, 1.3);
      world.position.set(0, rc * 3, -rc * 160);
      const worldScale = 1 - rc * 0.2;
      world.scale.setScalar(worldScale);

      /* ---- the fall: island sectors and landmark pieces break away ---- */
      island.chunks.forEach((chunk, i) => {
        const eligible = cur.divide > 0.5 ? chunkWest[i] : kind === "defeat";
        const k = eligible ? smooth(chunkOrder[i], chunkOrder[i] + 0.35, cur.ruin) : 0;
        chunk.mesh.position.copy(chunk.home).addScaledVector(chunk.out, k * 5).add(tmp.set(0, -k * k * 22, 0));
        chunk.mesh.rotation.set(chunk.spin.x * k * 2.5, chunk.spin.y * k * 2.5, chunk.spin.z * k * 2.5);
        if (cur.leak > 0.05 && glitchFlash > 0.3 && i % 3 === 0) chunk.mesh.position.x += (rand() - 0.5) * 0.4 * cur.leak;
      });
      landmark.pieces.forEach((piece, i) => {
        const eligible = cur.divide > 0.5 ? pieceWest[i] : kind === "defeat";
        const k = eligible ? smooth(pieceOrder[i], pieceOrder[i] + 0.3, cur.ruin) : 0;
        piece.object.position.copy(piece.home);
        piece.object.position.x += Math.sign(piece.cx || 1) * k * 2.2;
        piece.object.position.y -= k * k * 16;
        piece.object.rotation.z = pieceSpin[i] * k;
        if (cur.leak > 0.05 && glitchFlash > 0.3 && i % 4 === 1) piece.object.position.x += (rand() - 0.5) * 0.9 * cur.leak;
      });

      /* ---- the landmark ---- */
      landmark.beaconTint.copy(heroColors[Math.min(currentSlice, heroColors.length - 1)] || landmark.beaconColor);
      landmark.beaconTintAmt = cur.focus * 0.85;
      landmark.update({
        t: wt,
        dt: wdt,
        pulse: raw,
        trace: 1,
        outline: 0.12 * (1 - cur.ash) + cur.frost * 0.25,
        fill: 1,
        ground: 1,
        lit: (landmark.lightCount + 1) * (1 - cur.ruin * 0.95) * (cur.dawn > 0.3 ? 1 : 0.8 + cur.dawn),
        lightBoost: (0.9 + cur.gild * 0.6) * (1 - cur.ash * 0.4),
        beacon: cur.kindle * (1 - cur.ash * 0.6) + cur.gild * 0.4,
        motion: live * (1 - cur.ruin * 0.8),
        extras: (0.75 + cur.gild * 0.25) * (1 - cur.ash * 0.7) * live,
        gild: cur.gild,
        ash: cur.ash,
        frost: cur.frost,
        divide: cur.divide,
        exposure: 1,
        opacity: cur.presence,
        react: 0.8 * live
      });

      /* ---- the island ---- */
      island.material.opacity = cur.presence;
      island.material.emissive.copy(accent).lerp(ember, cur.ash).lerp(secondary, cur.leak);
      island.material.emissiveIntensity = 0.02 + cur.ash * 0.12 + cur.leak * 0.15 + kick * 0.03;
      island.material.color.setScalar(1).lerp(frostColor, cur.frost * 0.6);
      island.crystals.opacity = (0.5 + cur.gild * 0.4 + cur.leak * 0.4 + hat * 0.2) * cur.presence * (1 - cur.ash * 0.5);
      underLight.color.copy(accent).lerp(ember, cur.ash).lerp(secondary, cur.leak);
      underLight.intensity = 8 + cur.leak * 40 + cur.ash * 14 + kick * 8;
      ambient.intensity = 0.7 * (1 - cur.ash * 0.35) + cur.frost * 0.4;
      key.color.copy(white).lerp(bright, 0.3).lerp(gold, cur.dawn * 0.8).lerp(frostColor, cur.frost);

      /* ---- the die rolls the fate ---- */
      d20.group.position.y = D20_Y + Math.sin(wt * 0.8) * 0.18 * live;
      d20.uniforms.uOpacity.value = Math.max(cur.presence, clamp01(cur.kindle));
      d20.uniforms.uLit.value = kind === "defeat" ? Math.round(20 * (1 - cur.ash)) : 20;
      d20.uniforms.uHeat.value = cur.kindle * 0.5 + (landed ? 0.2 : 0.4) + kick * 0.3 + cur.leak * 0.4;
      d20.uniforms.uGold.value = kind === "victory" ? cur.gild : kind === "bittersweet" ? cur.gild * 0.5 : 0;
      d20.uniforms.uCrack.value = kind === "defeat" ? Math.min(1, cur.ash * 1.2) : kind === "bittersweet" ? cur.ash * 0.5 : 0;
      d20.uniforms.uFrost.value = cur.frost;
      if (!landed) {
        d20.target = null;
        d20.balance = false;
        d20.spin = 1.4 + kick * 2;
        d20.uniforms.uShowAmt.value = 0;
      } else if (kind === "draw") {
        d20.balance = true;
        d20.settleRate = 2.5;
        d20.uniforms.uShowAmt.value = 0;
      } else if (kind === "escape") {
        d20.target = null;
        d20.spin = 2 + cur.recede * 4;
        d20.uniforms.uShowAmt.value = 0;
      } else if (kind === "cliffhanger") {
        // It will not settle: it snaps between faces as the rift glitches.
        if (raw.snareHit || rand() < dt * 1.5) cliffShow = 1 + Math.floor(rand() * 20);
        d20.target = rand() < 0.97 ? cliffShow : null;
        d20.settleRate = 14;
        d20.uniforms.uShow.value = cliffShow;
        d20.uniforms.uShowAmt.value = 0.8;
      } else {
        d20.target = fate;
        d20.settleRate = currentBeat === kindIndex && progress < 0.15 ? 12 : 3;
        d20.uniforms.uShow.value = fate ?? -1;
        d20.uniforms.uShowAmt.value = 1;
      }
      // The defeat's die drops with the world it failed.
      if (kind === "defeat") d20.group.position.y -= Math.pow(smooth(0.55, 1, cur.ruin), 2) * 14;
      d20.edges.opacity = (0.35 + d20.uniforms.uHeat.value * 0.4) * d20.uniforms.uOpacity.value;
      d20.halo.material.color.copy(accent).lerp(gold, d20.uniforms.uGold.value).lerp(ember, d20.uniforms.uCrack.value);
      d20.halo.material.opacity = (0.15 + d20.uniforms.uHeat.value * 0.35 + swell * 0.15) * d20.uniforms.uOpacity.value;
      d20.update(wdt + (landed ? 0 : 0), camera.position);
      d20.group.getWorldPosition(diePos);

      /* ---- sun ---- */
      const sunX = cur.divide > 0.5 ? 9 : -7;
      sunPos.set(sunX, lerp(ISLAND_Y - 8, ISLAND_Y + 7.5, cur.dawn), -30);
      sun.position.copy(sunPos);
      rays.position.copy(sunPos);
      sun.material.opacity = cur.dawn * 0.95;
      sun.scale.setScalar(14 + cur.dawn * 10 + swell * 3);
      rays.material.opacity = cur.dawn * 0.55 * (0.8 + swell * 0.4);
      rays.scale.setScalar(44 + cur.dawn * 20);
      rays.material.rotation = wt * 0.03;
      sunLight.position.copy(sunPos).setZ(-6);
      sunLight.intensity = cur.dawn * 60;

      /* ---- rift, beam, streaks ---- */
      riftUniforms.uOpen.value = cur.rift * (1 + snare * 0.3 + glitchFlash * 0.4);
      riftUniforms.uTime.value = t;
      if (raw.snareHit && cur.leak > 0.1) glitchFlash = 1;
      glitchFlash = Math.max(0, glitchFlash - dt * 4);
      beamMaterial.opacity = cur.frost * (0.55 + Math.sin(t * 0.6) * 0.08);
      for (const w of weights) {
        w.material.opacity = cur.frost * 0.8;
        w.scale.setScalar(1.6);
      }
      if (kind === "escape") {
        const speed = 20 + cur.recede * 120 + kick * 30;
        for (let i = 0; i < STREAKS; i += 1) {
          const s = streakSeeds[i];
          s[2] = (s[2] + dt * speed * s[3]) % 120;
          const z = -120 + s[2];
          const len = 0.5 + cur.recede * 6 * s[3];
          const x = Math.cos(s[0]) * s[1];
          const y = Math.sin(s[0]) * s[1];
          streakPositions.set([x, y, z, x, y, z + len], i * 6);
        }
        streakAttr.needsUpdate = true;
        streakMaterial.opacity = Math.min(0.75, cur.recede * 1.2 + cur.burst * 0.3);
        escapeStar.position.copy(diePos);
        escapeStar.material.opacity = smooth(0.55, 1, cur.recede) * 0.95;
        escapeStar.scale.setScalar(4 + Math.sin(t * 2) * 0.3);
      }

      /* ---- the fates' particles ---- */
      burstAcc += dt * cur.burst * (kind === "victory" ? 40 : kind === "defeat" ? 90 : kind === "bittersweet" ? 60 : kind === "cliffhanger" ? 30 : kind === "escape" ? 20 : 0);
      if (!reducedMotion) {
        if ((kind === "defeat" || kind === "bittersweet") && cur.ash > 0.05) burstAcc += dt * cur.ash * 30;
        while (burstAcc > 1) {
          burstAcc -= 1;
          if (kind === "victory" || (kind === "bittersweet" && rand() < 0.5)) {
            const x = kind === "bittersweet" ? 0.5 + rand() * 8 : (rand() - 0.5) * 16;
            motes.spawn({ x, y: ISLAND_Y + rand() * 2, z: (rand() - 0.5) * 8, vx: (rand() - 0.5) * 0.6, vy: 1.5 + rand() * 2.5, life: 2.5 + rand() * 2, size: 0.07 + rand() * 0.08, color: rand() < 0.6 ? gold : bright, shape, drag: 0.3, flutter: petal ? 0.6 : 0.15 });
          } else if (kind === "defeat" || kind === "bittersweet") {
            const x = kind === "bittersweet" ? -0.5 - rand() * 12 : (rand() - 0.5) * 26;
            const isEmber = rand() < 0.3;
            motes.spawn({ x, y: ISLAND_Y + 10 + rand() * 4, z: (rand() - 0.5) * 12, vx: (rand() - 0.5) * 0.5 + 0.3, vy: -(1 + rand() * 1.5), life: 6, size: isEmber ? 0.06 : 0.1 + rand() * 0.06, color: isEmber ? ember : ashColor, alpha: isEmber ? 1 : 0.6, shape: 0, flutter: 0.5 });
          } else if (kind === "cliffhanger") {
            const a = rand() * TAU;
            motes.spawn({ x: Math.cos(a) * 0.3, y: ISLAND_Y + 3 + (rand() - 0.5) * 12, z: -8.5, vx: (rand() - 0.5) * 3, vy: (rand() - 0.5), vz: 2 + rand() * 3, life: 1.5, size: 0.08, color: rand() < 0.5 ? secondary : white, shape: 2, drag: 0.8 });
          } else if (kind === "escape") {
            motes.spawn({ x: diePos.x, y: diePos.y, z: diePos.z, vx: (rand() - 0.5) * 2, vy: (rand() - 0.5) * 2, vz: 4 + rand() * 4, life: 1.6, size: 0.08, color: bright, shape });
          }
        }
        // Kicks land the genre's celebration in victory; tremor in defeat.
        if (raw.kickHit && kind === "victory" && cur.gild > 0.4 && rand() < 0.75) {
          firework((rand() - 0.5) * 18, ISLAND_Y + 6 + rand() * 6, -4 - rand() * 8, 0.8 + rand() * 0.6);
        }
      }
      motes.update(wdt > 0 ? dt : 0);
      rings.update(dt);

      /* ---- the sky ---- */
      projected.copy(sunPos).project(camera);
      backdrop.uniforms.uSun.value.set(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5);
      backdrop.uniforms.uReveal.value = cur.presence;
      backdrop.uniforms.uEdgeGain.value = 0.3;
      backdrop.uniforms.uDawn.value = cur.dawn;
      backdrop.uniforms.uEmber.value = cur.ash;
      backdrop.uniforms.uSplit.value = cur.divide;
      backdrop.uniforms.uFrost.value = cur.frost;
      backdrop.uniforms.uGlitch.value = cur.leak * 0.5 + glitchFlash * cur.leak * 0.8;
      backdrop.uniforms.uRecede.value = cur.recede;
      backdrop.uniforms.uLift.value = 0.72 * (1 - cur.ash * 0.3);
      frameData.t = t;
      frameData.dt = wdt;
      frameData.envelope = (0.6 + cur.gild * 0.3) * (1 - cur.ash * 0.5) * (1 - cur.recede * 0.6);
      frameData.drive = 0.8 + cur.burst * 0.4;
      frameData.pulse = raw;

      /* ---- the lens ---- */
      lensUniforms.uExposure.value = exposure;
      lensUniforms.uDesat.value = Math.max(garnish.mono, cur.desat) + cur.frost * 0.25;
      lensUniforms.uTintAmt.value = cur.tintAmt;
      lensUniforms.uFlash.value = cur.flash * (kind === "escape" ? 0.3 : 1);
      lensUniforms.uBlack.value = cur.black;
      lensUniforms.uGlow.value = cur.glow;
      lensUniforms.uTime.value = t;
      root.style.setProperty("--gate", String(cur.gate));
      root.style.setProperty("--jitter", String(Math.round(cur.jitter * 10) / 10));

      /* ---- camera ---- */
      const swing = Math.sin(wt * 0.05) * 0.32;
      const p = ctx.settled ? 1 : ctx.p;
      switch (id) {
        case "strike":
          poseTarget.set(0, D20_Y + 0.8, 9);
          lookTarget.set(0, D20_Y, 0);
          break;
        case "loom":
          poseTarget.set(Math.sin(swing) * 22, 5.5, Math.cos(swing) * 22);
          lookTarget.set(0, ISLAND_Y + 0.6, 0);
          break;
        case "kind":
          poseTarget.set(Math.sin(swing) * 19, 5, Math.cos(swing) * 19);
          lookTarget.set(0, ISLAND_Y + 1.6, 0);
          break;
        case "title":
          poseTarget.set(Math.sin(swing) * 21, 5.2, Math.cos(swing) * 21);
          lookTarget.set(0, ISLAND_Y + 1.2, 0);
          break;
        case "epilogue":
        case "chronicle":
        case "ledger":
        case "cast":
          // Step aside: the world sits upper-right, the words own the left.
          poseTarget.set(Math.sin(swing) * 25 - 5, 5.6, Math.cos(swing) * 25);
          lookTarget.set(-7, ISLAND_Y + 0.2, 0);
          break;
        default:
          switch (kind) {
            case "victory":
              poseTarget.set(Math.sin(swing) * 21, 5 + p * 4, 21 + p * 2);
              lookTarget.set(0, ISLAND_Y + 1.6 + p * 1.5, 0);
              break;
            case "defeat":
              poseTarget.set(Math.sin(swing) * 22, 9 + p * 3, 20);
              lookTarget.set(0, ISLAND_Y - p * 3, 0);
              break;
            case "draw":
              poseTarget.set(0, 4.6, 21);
              lookTarget.set(0, ISLAND_Y + 1.4, 0);
              break;
            case "cliffhanger":
              poseTarget.set(-3, 3.6, 19);
              lookTarget.set(0, ISLAND_Y + 2.2, -3);
              break;
            default:
              poseTarget.set(Math.sin(swing) * 22, 5.2, 22);
              lookTarget.set(0, ISLAND_Y + 1.2, 0);
          }
      }
      const ease = snapValues ? 1 : approach(dt, 1.8);
      pose.lerp(poseTarget, ease);
      look.lerp(lookTarget, ease);
      const shake = cur.shake * 0.35;
      camera.position.set(
        pose.x + Math.sin(t * 31) * shake + Math.sin(t * 0.11) * 0.05 * live,
        pose.y + Math.sin(t * 41 + 2) * shake * 0.7,
        pose.z
      );
      camera.lookAt(look);
      if (kind === "cliffhanger" && (id === "fin" || id === "hold")) {
        camera.rotateZ(-0.06 * cur.leak);
      }
      camera.updateMatrixWorld();
      skyCamera.position.set(-swing * 1.4 + camera.position.x * 0.05, 0.4, 11);
      skyCamera.lookAt(skyCamera.position.x * 0.5, 0.6, 0);

      bloomPass.strength = cur.bloom * BLOOM_BASE * (1 - cur.veil * 0.25);
      composer.render(dt);
    };

    if (reducedMotion) {
      // One authored still — the settled hold frame — plus timer-driven cards.
      const ctx: Ctx = { id: "hold", p: 1, hump: 0, settled: true, through: 1, t: 10 };
      spine(ctx);
      movement.script(ctx, T);
      for (const keyName of TARGET_KEYS) cur[keyName] = T[keyName];
      snapValues = true;
      timeOffset = -starts[reel.length - 1];
      renderFrame(10, 0.016);
      const timers: Array<ReturnType<typeof setTimeout>> = [];
      let at = 0;
      for (let i = 0; i < reel.length; i += 1) {
        const target = i;
        timers.push(setTimeout(() => setBeatIndex(target), at * 1000));
        at += reel[i].seconds === Infinity ? 0 : reel[i].seconds;
      }
      const playSeek = seekRef.current;
      seekRef.current = (target: number) => {
        for (const timer of timers) clearTimeout(timer);
        timers.length = 0;
        playSeek?.(target);
        renderFrame(clockNow + 0.05, 0.016);
      };
      return () => {
        for (const timer of timers) clearTimeout(timer);
        observer.disconnect();
        seekRef.current = null;
        backdrop.dispose();
        tracker.dispose();
        composer.dispose();
        renderer.dispose();
        if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      };
    }

    const startedAt = performance.now();
    let last = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const t = (performance.now() - startedAt) / 1000;
      const dt = Math.min(Math.max(t - last, 0.001), 0.1);
      last = t;
      renderFrame(t, dt);
    };
    // Paint frame zero synchronously so the mount never shows a blank canvas.
    renderFrame(0.0001, 0.016);
    frame = requestAnimationFrame(loop);

    // Dev-only: lets /outrotest (and headless verification) render an exact
    // moment of the reel on demand, since a hidden pane never ticks rAF.
    const devWindow = window as unknown as { __loomTick?: (t: number) => void };
    if (process.env.NODE_ENV !== "production") devWindow.__loomTick = (t: number) => renderFrame(t, 0.016);

    return () => {
      cancelAnimationFrame(frame);
      delete devWindow.__loomTick;
      observer.disconnect();
      seekRef.current = null;
      backdrop.dispose();
      tracker.dispose();
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
    // The whole world is rebuilt when the ending kind or theme changes (the
    // debug gallery does exactly that); content counts are captured via `reel`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, visual.key, reel]);

  /* ---------------- Skip / advance ---------------- */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === " " || event.key === "Enter" || event.key === "ArrowRight") {
        event.preventDefault();
        advance();
      } else if (event.key === "ArrowLeft" || event.key === "Backspace") {
        event.preventDefault();
        retreat();
      } else if (event.key === "Home") {
        event.preventDefault();
        restart();
      } else if (event.key === "End" || event.key === "Escape") {
        event.preventDefault();
        skipToEnd();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, retreat, restart, skipToEnd]);

  /* ---------------- The band ---------------- */
  const titleWords = useMemo(() => ending.title.trim().split(/\s+/).slice(0, 16), [ending.title]);
  const summaryLen = (ending.summary || "").length;
  const activePlayer = players[Math.min(slice, Math.max(players.length - 1, 0))];
  const activeMember = activePlayer ? castByPlayer.get(activePlayer.id) : undefined;
  const scrimOn = beatId === "epilogue" || beatId === "chronicle" || beatId === "ledger" || beatId === "cast";

  return (
    <div
      ref={rootRef}
      className={`loom loom-${kind} loom-beat-${beatId}`}
      style={{ ["--gate" as string]: String(movement.aperture), ["--xfade" as string]: `${movement.dissolve}s` }}
      onClick={(event) => {
        event.stopPropagation();
        advance();
      }}
    >
      <div ref={mountRef} className="loom-gate" aria-hidden />
      <div className={`loom-scrim ${scrimOn ? "is-on" : ""}`} aria-hidden />
      <div className="loom-matte loom-matte-top" aria-hidden />
      <div className="loom-matte loom-matte-bottom" aria-hidden />

      <div className="loom-band">
        {/* STRIKE — the saga's name under the kindling worldheart. */}
        <div className={`loom-card loom-card-strike ${beatId === "strike" ? "is-on" : ""}`}>
          <span className="loom-saga">{campaignTitle}</span>
        </div>

        {/* LOOM — the world stands; one line names what became of IT. */}
        <div className={`loom-card loom-card-loom ${beatId === "loom" ? "is-on" : ""}`}>
          <span className="loom-kicker">{campaignTitle}</span>
          <span className="loom-line">{fateLine}</span>
        </div>

        {/* KIND — the verdict, alone on the frame. */}
        <div className={`loom-card loom-card-kind ${beatId === "kind" ? "is-on" : ""}`}>
          <span className="loom-kind">{kindLabel}</span>
        </div>

        {/* TITLE — the one moment allowed to be enormous. */}
        <div className={`loom-card loom-card-title ${beatId === "title" ? "is-on" : ""}`}>
          <h1 className="loom-title" data-len={titleWords.length > 8 ? "long" : titleWords.length > 4 ? "mid" : "short"}>
            {titleWords.map((word, index) => (
              <span key={index} className="loom-word" style={{ ["--i" as string]: index }}>
                {word}
              </span>
            ))}
          </h1>
        </div>

        {/* EPILOGUE — the summary, sized to its own length. */}
        <div className={`loom-card loom-card-epilogue ${beatId === "epilogue" ? "is-on" : ""}`}>
          <p className="loom-subtitle" data-len={summaryLen > 420 ? "long" : summaryLen > 240 ? "mid" : "short"}>
            {ending.summary}
          </p>
        </div>

        {/* CHRONICLE — one line at a time, sliced across the beat. */}
        <div className={`loom-card loom-card-chronicle ${beatId === "chronicle" ? "is-on" : ""}`}>
          <span className="loom-label">The Chronicle</span>
          <p key={slice} className="loom-intertitle">
            {highlights[Math.min(slice, Math.max(highlights.length - 1, 0))]}
          </p>
        </div>

        {/* LEDGER — hairline rules, big numbers, tiny labels. No boxes. */}
        <div className={`loom-card loom-card-ledger ${beatId === "ledger" ? "is-on" : ""}`}>
          <span className="loom-label">The Ledger</span>
          <div className="loom-ledger" data-count={stats.length}>
            {stats.map((stat, index) => (
              <div key={index} className="loom-entry" style={{ ["--i" as string]: index }}>
                <span className="loom-entry-value" data-len={String(stat.value).length > 8 ? "long" : "short"}>
                  {stat.value}
                </span>
                <span className="loom-entry-label">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CAST — one hero holds the frame; the worldheart takes their colour. */}
        <div className={`loom-card loom-card-cast ${beatId === "cast" ? "is-on" : ""}`}>
          {activePlayer ? (
            <div key={activePlayer.id} className="loom-cast">
              <div className="loom-face" style={{ ["--seat" as string]: accentColor(activePlayer.color) }}>
                {activePlayer.portraitUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={activePlayer.portraitUrl} alt="" />
                ) : (
                  <span className="loom-face-blank">
                    <span className="loom-face-initial">
                      {(activePlayer.characterName || activePlayer.name || "?").trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="loom-face-glyph" style={{ fontFamily: visual.glyphFont.replace(/^[\d.]+px\s*/, "") }}>
                      {visual.glyphs.charAt(players.indexOf(activePlayer) % visual.glyphs.length)}
                    </span>
                  </span>
                )}
              </div>
              <div className="loom-cast-lines">
                <span className="loom-cast-name" style={{ color: accentColor(activePlayer.color) }}>
                  {activePlayer.characterName || activePlayer.name}
                </span>
                {activeMember?.title ? <span className="loom-cast-epithet">{activeMember.title}</span> : null}
                {activePlayer.characterName ? <span className="loom-cast-player">{activePlayer.name}</span> : null}
                {activeMember?.fate ? <p className="loom-cast-fate">{activeMember.fate}</p> : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* FIN — and, if the saga wrote one, the last line the table reads. */}
        <div className={`loom-card loom-card-fin ${beatId === "fin" || beatId === "hold" ? "is-on" : ""}`}>
          <span className="loom-fin">{movement.fin}</span>
          {ending.epitaph ? <span className="loom-epitaph">{ending.epitaph}</span> : null}
        </div>
      </div>

      {beatId === "hold" && onExit ? (
        <button
          className="loom-leave"
          onClick={(event) => {
            event.stopPropagation();
            onExit();
          }}
        >
          Leave the table
        </button>
      ) : null}

      {beatIndex > 0 ? (
        <button
          className="loom-back"
          onClick={(event) => {
            event.stopPropagation();
            retreat();
          }}
        >
          ‹ Back
        </button>
      ) : null}

      {beatId !== "hold" ? (
        <button
          className="loom-skip"
          onClick={(event) => {
            event.stopPropagation();
            skipToEnd();
          }}
        >
          Skip
        </button>
      ) : null}
    </div>
  );
}
