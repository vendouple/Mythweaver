"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { CampaignEnding, EndingCastMember, EndingKind, EndingStat, Player } from "@/lib/campaign/types";
import { accentColor } from "@/lib/client/api";
import { themeVisual, ThemeKey } from "@/components/three/themeVisuals";
import { ISLAND, KITS, SLOTS, makeGeometry, DEBRIS_SHAPE, LandmarkDef } from "@/components/three/WorldForge";

/**
 * THE WORLD'S FATE
 * ================
 * The Weaving opens every saga by FORGING a world: a floating island and its
 * landmarks assemble out of the void, piece by piece. So the finale is the
 * mirror the fiction demands — the same island, whole, meeting its ending.
 * The players watched this world get built; now they watch what their story
 * did to it:
 *
 *   victory      — THE DAWN.      A sun climbs from behind the island —
 *                                 halo, god-rays, a flare chain — the stone
 *                                 itself gilds gold, shafts of light rise
 *                                 off every landmark, sparks stream up off
 *                                 the plateau, and three triumph rings break
 *                                 outward as it clears. Saved, and lit like it.
 *   defeat       — THE FALL.      Ember fissures open, ash rains, the island
 *                                 lists and darkens, landmark by landmark
 *                                 calves off — and beneath it a lightless MAW
 *                                 opens and grows until it swallows the crag.
 *                                 Only the heroes' landmark and a guttering
 *                                 worldheart are left above the hole.
 *   bittersweet  — THE HALF-LIGHT. A terminator splits sky, stone, dust and
 *                                 light: the +x half gilds into dawn while
 *                                 the -x half greys, cracks and falls away.
 *                                 A seam of white light stands on the line,
 *                                 and the world stops turning so it holds.
 *                                 Both are true. The line never moves again.
 *   escape       — THE LEAVING.   The world banks, lifts and recedes down a
 *                                 tunnel of streaking light that tears past
 *                                 the lens, dragging a comet-tail behind it,
 *                                 until it is one bright cross-flared star.
 *   draw         — THE STILLNESS. Spin, debris, dust — even the motes —
 *                                 freeze mid-air, the stone vitrifies to
 *                                 cold glass, a ring stops half-expanded,
 *                                 and a beam of light runs level through the
 *                                 island between two opposed pillars: a scale,
 *                                 balanced, held.
 *   cliffhanger  — THE CRACK.     A jagged rift tears open behind the world,
 *                                 wrong-coloured seams split the plateau, a
 *                                 pulse beats under the crag, the landmarks
 *                                 glitch out of place and the worldheart takes
 *                                 the infection. Hard cut, mid-tremor. Not
 *                                 finished.
 *
 * The island geometry, per-theme landmark kits and debris shapes are imported
 * from the WorldForge itself, so the bookend is literal — same silhouettes,
 * same materials, eighteen themes for free.
 *
 * Engineering rules carried over, still load-bearing:
 *   · ONE CLOCK. The render loop owns the beat index; skip is a seek.
 *   · ONE RIG PER FATE. Each kind builds only its own apparatus (§ the rigs);
 *     the shared world — cloud sea, sibling islands, heart, cracks — is built
 *     for everyone. The whole scene is rebuilt when the kind changes, so a rig
 *     never has to defend against a fate that is not running.
 *   · The picture comes FIRST. The aperture is a widescreen crop, not a
 *     letterbox slot; the world keeps its light under the reading beats.
 *   · ONE text block at a time in one fixed band; variable content is
 *     time-sliced, never stacked.
 *   · READABILITY IS STRUCTURAL: during the reading beats the world steps
 *     aside and dims and a scrim backs the band — the words never fight the
 *     picture for the same pixels.
 *   · Terminal events RESOLVE into a frame that can hold for twenty minutes.
 *   · The CPU eases ~20 scalar targets; everything else is scene graph.
 *   · The reel scrubs BOTH ways: Space/→/click advance, ←/Backspace rewind,
 *     Home restarts. A seek is a hard cut; the scripts are stateless per
 *     frame, so the world always matches wherever the needle drops.
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
/* Per-theme atmosphere — behaviour only; colours come from THEME_VISUALS */
/* ------------------------------------------------------------------ */

type Garnish = {
  stars: number;
  horizon: number; // low warm band (western dusk, steampunk furnace, hearth)
  bars: number; //    noir venetians
  scan: number; //    fine scanline shimmer
  breathe: number; // breathing vignette
  gutter: number; //  irregular exposure gutter (candles, failing reactors)
  mono: number; //    baseline desaturation
  moteSize: number;
};

const GARNISH: Record<ThemeKey, Garnish> = {
  none:        { stars: 0.55, horizon: 0.08, bars: 0,    scan: 0,    breathe: 0.15, gutter: 0,    mono: 0,    moteSize: 1.0 },
  fantasy:     { stars: 0.65, horizon: 0.14, bars: 0,    scan: 0,    breathe: 0.1,  gutter: 0,    mono: 0,    moteSize: 1.1 },
  scifi:       { stars: 0.9,  horizon: 0,    bars: 0,    scan: 0.5,  breathe: 0,    gutter: 0,    mono: 0,    moteSize: 0.8 },
  horror:      { stars: 0.12, horizon: 0.05, bars: 0,    scan: 0,    breathe: 1,    gutter: 0.7,  mono: 0.1,  moteSize: 0.9 },
  noir:        { stars: 0.15, horizon: 0.06, bars: 0.85, scan: 0,    breathe: 0.2,  gutter: 0.15, mono: 0.4,  moteSize: 0.7 },
  modern:      { stars: 0.35, horizon: 0.1,  bars: 0,    scan: 0.15, breathe: 0,    gutter: 0,    mono: 0,    moteSize: 0.9 },
  western:     { stars: 0.45, horizon: 0.8,  bars: 0,    scan: 0,    breathe: 0,    gutter: 0.12, mono: 0,    moteSize: 1.0 },
  postapoc:    { stars: 0.2,  horizon: 0.5,  bars: 0,    scan: 0,    breathe: 0.35, gutter: 0.3,  mono: 0.08, moteSize: 1.15 },
  cyberpunk:   { stars: 0.3,  horizon: 0.12, bars: 0.1,  scan: 0.7,  breathe: 0,    gutter: 0.2,  mono: 0,    moteSize: 0.8 },
  spaceopera:  { stars: 1,    horizon: 0,    bars: 0,    scan: 0,    breathe: 0,    gutter: 0,    mono: 0,    moteSize: 0.9 },
  gothic:      { stars: 0.28, horizon: 0.1,  bars: 0,    scan: 0,    breathe: 0.8,  gutter: 0.5,  mono: 0.08, moteSize: 1.0 },
  urbanfantasy:{ stars: 0.5,  horizon: 0.25, bars: 0,    scan: 0.08, breathe: 0.1,  gutter: 0.1,  mono: 0,    moteSize: 1.05 },
  steampunk:   { stars: 0.3,  horizon: 0.5,  bars: 0,    scan: 0.05, breathe: 0.1,  gutter: 0.25, mono: 0,    moteSize: 1.1 },
  pirate:      { stars: 0.6,  horizon: 0.6,  bars: 0,    scan: 0,    breathe: 0.1,  gutter: 0.18, mono: 0,    moteSize: 1.05 },
  eastasian:   { stars: 0.5,  horizon: 0.3,  bars: 0,    scan: 0,    breathe: 0.1,  gutter: 0.05, mono: 0,    moteSize: 1.35 },
  superhero:   { stars: 0.5,  horizon: 0.15, bars: 0,    scan: 0.08, breathe: 0,    gutter: 0,    mono: 0,    moteSize: 1.0 },
  pulp:        { stars: 0.4,  horizon: 0.55, bars: 0,    scan: 0,    breathe: 0.1,  gutter: 0.1,  mono: 0.1,  moteSize: 1.0 },
  cozy:        { stars: 0.4,  horizon: 0.4,  bars: 0,    scan: 0,    breathe: 0.2,  gutter: 0.15, mono: 0,    moteSize: 1.4 }
};

/* ------------------------------------------------------------------ */
/* Shaders (backdrop sky, lens, motes — the world itself is scene graph) */
/* ------------------------------------------------------------------ */

const FULLSCREEN_VERT = `
precision highp float;
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

/**
 * Every hand-written shader here was authored against the DISPLAY — its
 * numbers are the sRGB values that used to land straight on the canvas. The
 * frame now goes through a bloom composer, whose buffer is linear, so each of
 * them decodes on the way out and OutputPass re-encodes at the end. Without
 * this the whole finale washes out the moment the composer is switched on.
 */
const SRGB_DECODE = `
vec3 toLinear(vec3 c) {
  c = max(c, 0.0);
  return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, step(c, vec3(0.04045)));
}
`;

const NOISE_GLSL = `
float hashf(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noisef(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashf(i), hashf(i + vec2(1.0, 0.0)), u.x),
             mix(hashf(i + vec2(0.0, 1.0)), hashf(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = noisef(p) * 0.55;
  v += noisef(p * 2.1) * 0.28;
  v += noisef(p * 4.3) * 0.17;
  return v;
}
`;

const BACKDROP_FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime, uRaw, uExposure, uDesat, uTintAmt, uStars, uHorizon, uBars, uScan, uBreathe, uAspect;
uniform float uDawn, uDivide, uEmber, uWarp, uLeakSky, uFrost;
uniform vec2 uSunPos;
uniform vec3 uSkyTop, uSkyBot, uNeb0, uNeb1, uNeb2, uTint, uHorizonColor;
uniform vec3 uDawnColor, uEmberColor, uLeakColor, uFrostColor;
${NOISE_GLSL}
${SRGB_DECODE}

void main() {
  vec2 uv = vUv;
  vec3 col = mix(uSkyBot, uSkyTop, pow(clamp(uv.y, 0.0, 1.0), 1.35));

  vec2 q = vec2(uv.x * uAspect, uv.y);
  float t = uTime * 0.015;
  float w = fbm(q * 1.6 + vec2(t, -t * 0.6));
  vec2 wq = q + (w - 0.5) * 1.4;
  col += uNeb0 * smoothstep(0.45, 0.85, fbm(wq * 1.1 + vec2(0.0, t))) * 0.3;
  col += uNeb1 * smoothstep(0.5, 0.9, fbm(wq * 1.7 + vec2(3.7, -t * 1.3))) * 0.22;
  col += uNeb2 * smoothstep(0.4, 0.8, fbm(wq * 0.8 + vec2(-2.2, t * 0.7))) * 0.18;

  vec2 cell = floor(q * vec2(190.0, 110.0));
  float sh = hashf(cell);
  float tw = 0.6 + 0.4 * sin(uTime * (1.0 + sh * 4.0) + sh * 40.0);
  col += vec3(step(1.0 - uStars * 0.012, sh) * tw) * 0.85;

  col += uHorizonColor * exp(-abs(uv.y - 0.16) * 6.5) * uHorizon * 0.8;

  // THE DAWN — a warm flood climbing from the horizon, an atmospheric corona
  // around the sun itself, and one clean shaft fanning off it. Under uDivide
  // the whole apparatus is gated to the +x half of the frame.
  float dawnSide = mix(1.0, smoothstep(0.34, 0.66, uv.x), uDivide);
  float dawnBand = exp(-max(uv.y - 0.04, 0.0) * mix(9.0, 2.1, uDawn));
  vec3 dawnCol = mix(uDawnColor, vec3(1.0, 0.93, 0.8), uDawn * 0.4);
  col += dawnCol * dawnBand * uDawn * 1.0 * dawnSide;
  if (uDawn > 0.001) {
    vec2 rel = (uv - uSunPos) * vec2(uAspect, 1.0);
    float r = length(rel);
    // Corona: a wide soft bloom of sky around the disc, brightest at its lip.
    col += dawnCol * exp(-r * 2.6) * uDawn * 0.5 * dawnSide;
    col += vec3(1.0, 0.95, 0.85) * exp(-r * 10.0) * pow(uDawn, 1.5) * 0.8 * dawnSide;
    // God-rays: broad fan sweeping out of the disc, softened with distance.
    float ang = atan(rel.y, rel.x);
    float fan = 0.5 + 0.5 * sin(ang * 9.0 + uTime * 0.08);
    col += dawnCol * pow(fan, 3.0) * smoothstep(0.06, 0.55, r) * exp(-r * 1.5) * pow(uDawn, 1.8) * 0.2 * dawnSide;
  }
  col = mix(col, col * vec3(1.09, 1.01, 0.88), uDawn * dawnSide * 0.55);

  // THE HALF-LIGHT — beyond the terminator the sky cools and dims, and a hard
  // seam of white light stands exactly on the line where the two fates meet.
  float coldSide = (1.0 - smoothstep(0.34, 0.66, uv.x)) * uDivide;
  col = mix(col, col * vec3(0.42, 0.52, 0.74), coldSide * 0.72);
  col += vec3(0.95, 0.9, 0.78) * exp(-abs(uv.x - 0.5) * 42.0) * uDivide * 0.3;
  col += vec3(1.0, 0.97, 0.9) * exp(-abs(uv.x - 0.5) * 190.0) * uDivide * 0.5;

  // THE FALL — ember light low on the sky, ash-dark above, smoke drifting up
  // through it. The sky itself is on fire from below.
  if (uEmber > 0.001) {
    col += uEmberColor * exp(-abs(uv.y - 0.1) * 6.0) * uEmber * 0.8;
    float smoke = fbm(q * 2.2 + vec2(uTime * 0.03, -uTime * 0.06));
    col = mix(col, col * vec3(0.42, 0.4, 0.44), smoothstep(0.35, 0.75, smoke) * uEmber * 0.75);
    col += uEmberColor * smoothstep(0.55, 0.9, fbm(q * 3.4 + vec2(-uTime * 0.05, uTime * 0.09)))
           * exp(-max(uv.y - 0.05, 0.0) * 3.2) * uEmber * 0.35;
    col *= 1.0 - uEmber * 0.42 * smoothstep(0.25, 1.0, uv.y);
  }

  // THE LEAVING — the starfield tears into radial streaks and blue-shifts as
  // the world drops away down the tunnel.
  if (uWarp > 0.001) {
    vec2 rel = (uv - vec2(0.5, 0.55)) * vec2(uAspect, 1.0);
    float r = length(rel);
    float ang = atan(rel.y, rel.x);
    for (int k = 0; k < 3; k++) {
      float band = float(k);
      float lane = hashf(vec2(floor(ang * (38.0 + band * 27.0)), 7.0 + band));
      float lead = fract(r * (1.7 + band * 0.7) - uTime * (0.5 + lane * 1.1) * uWarp);
      float streak = step(0.9 - band * 0.02, lane) * smoothstep(0.03, 0.35, r) * pow(smoothstep(1.0, 0.35, lead), 2.0);
      col += mix(vec3(0.72, 0.88, 1.0), vec3(0.55, 0.8, 1.0), band * 0.5) * streak * uWarp * (0.6 - band * 0.13);
    }
    col = mix(col, col * vec3(0.78, 0.92, 1.15), uWarp * 0.4);
  }

  // THE CRACK — a wrong light staining the sky from below, and a sick aurora
  // crawling up out of it.
  if (uLeakSky > 0.001) {
    col += uLeakColor * exp(-uv.y * 4.0) * uLeakSky * 0.9;
    float aur = smoothstep(0.4, 0.95, fbm(vec2(q.x * 2.6 + uTime * 0.04, q.y * 5.0 - uTime * 0.02)));
    col += uLeakColor * aur * exp(-max(uv.y - 0.1, 0.0) * 2.4) * uLeakSky * 0.55;
  }

  // THE STILLNESS — the sky goes to cold glass: drained, faintly blue, and
  // holding perfectly level.
  if (uFrost > 0.001) {
    float lumF = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, mix(vec3(lumF), uFrostColor * (lumF * 1.5 + 0.05), 0.45), uFrost * 0.6);
    col += uFrostColor * exp(-abs(uv.y - 0.52) * 3.0) * uFrost * 0.06;
  }

  float bar = smoothstep(0.25, 0.75, 0.5 + 0.5 * sin((uv.y * 7.0 + uv.x * 0.9) * 6.28318));
  col *= 1.0 - uBars * 0.5 * bar;

  col += uScan * 0.028 * sin(uv.y * 640.0 + uTime * 3.0) * vec3(0.7, 1.0, 1.0);

  float d = length((uv - vec2(0.5, 0.52)) * vec2(uAspect * 0.62, 1.0));
  float breathe = 1.0 + uBreathe * 0.12 * sin(uTime * 0.5);
  col *= 1.0 - smoothstep(0.46, 1.12, d * breathe) * 0.7;

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum), clamp(uDesat, 0.0, 1.0));
  col = mix(col, uTint * (lum * 1.6 + 0.08), uTintAmt * 0.55);
  col *= uExposure;

  col += (hashf(uv * vec2(1897.0, 1013.0) + fract(uRaw) * 71.3) - 0.5) * 0.05;
  gl_FragColor = vec4(toLinear(col), 1.0);
}
`;

/**
 * THE CLOUD SEA — the drop the island floats over. A slow fbm deck far below,
 * lit from whichever direction this fate is lit from, so the dawn gilds it,
 * the fall sets it smouldering and the crack stains it. It is what gives the
 * island a height to fall from.
 */
const CLOUD_VERT = `
precision highp float;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CLOUD_FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime, uOpacity, uDawn, uEmber, uLeak, uFrost, uDivide;
uniform vec3 uBase, uDawnColor, uEmberColor, uLeakColor, uFrostColor;
${NOISE_GLSL}
${SRGB_DECODE}

void main() {
  vec2 p = vUv * vec2(6.0, 6.0);
  float deck = fbm(p + vec2(uTime * 0.012, uTime * 0.006));
  deck += fbm(p * 2.7 - vec2(uTime * 0.02, 0.0)) * 0.45;
  deck = smoothstep(0.42, 1.05, deck);

  vec3 col = uBase * (0.45 + deck * 0.9);
  // Warm side lighting rakes across the top of the deck.
  float lit = smoothstep(0.5, 1.1, deck);
  float side = mix(1.0, smoothstep(0.42, 0.6, vUv.x), uDivide);
  col += uDawnColor * lit * uDawn * 0.5 * side;
  col += uEmberColor * lit * uEmber * 0.45;
  col += uLeakColor * lit * uLeak * 0.4;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, mix(vec3(lum), uFrostColor * (lum * 1.4 + 0.04), 0.5), uFrost * 0.7);
  col = mix(col, col * vec3(0.45, 0.55, 0.78), (1.0 - side) * uDivide * 0.7);

  // Fade to nothing at the edges of the deck so it never shows a rim.
  vec2 e = abs(vUv - 0.5) * 2.0;
  float edge = (1.0 - smoothstep(0.35, 1.0, max(e.x, e.y))) * (1.0 - smoothstep(0.4, 1.0, length(e)));
  float a = clamp(deck * 0.85 + 0.06, 0.0, 1.0) * edge * uOpacity;
  gl_FragColor = vec4(toLinear(col), a);
}
`;

/**
 * THE RIFT — the cliffhanger's tear. A jagged, hard-edged split with a white
 * core and a wrong-coloured bleed, torn open behind the island. It widens
 * with uOpen, and the crawling noise means it never reads as a drawn line.
 */
const RIFT_FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime, uOpen;
uniform vec3 uCore, uEdge;
${NOISE_GLSL}
${SRGB_DECODE}

void main() {
  vec2 uv = vUv;
  float y = uv.y;
  // The seam wanders: a stack of octaves keeps it jagged at every scale.
  float wander = (fbm(vec2(y * 3.4, 11.0)) - 0.5) * 0.34
               + (fbm(vec2(y * 13.0, 3.0)) - 0.5) * 0.1
               + (fbm(vec2(y * 41.0, 7.0)) - 0.5) * 0.035;
  float d = abs(uv.x - 0.5 - wander);

  // Wider in the middle, pinched to nothing at both ends — a tear, not a slot.
  // Kept THIN on purpose: the island has to stay a silhouette against it, and
  // a wide core just floods the frame with the secondary colour.
  float taper = pow(sin(clamp(y, 0.0, 1.0) * 3.14159), 0.7);
  float width = (0.0015 + 0.011 * uOpen) * taper;
  float flicker = 0.82 + 0.18 * sin(uTime * 9.0 + y * 24.0) * step(0.4, uOpen);

  float core = 1.0 - smoothstep(width * 0.4, width, d);
  float bleed = exp(-d / max(width * 5.0, 0.001)) * 0.5;
  float haze = exp(-d * 22.0) * 0.14 * uOpen;

  vec3 col = uCore * core + uEdge * (bleed + haze) * 0.9;
  float a = clamp(core + bleed * 0.7 + haze, 0.0, 1.0) * uOpen * flicker;
  gl_FragColor = vec4(toLinear(col), a);
}
`;

/** Ambient dust + event motes (embers, ash, sparks), fully GPU-animated. */
const MOTE_VERT = `
precision highp float;
attribute vec4 aBed;    // sx, sy, sz, tier (0 ambient, 1 event)
attribute float aHueMix;
uniform float uTime, uBurst, uSize, uWarm, uDivide, uFreeze;
uniform vec2 uWind, uBurstDir;
uniform vec3 uMoteA, uMoteB, uWarmColor, uFrostColor;
varying vec3 vCol;
varying float vA;
void main() {
  vec3 base = vec3(mix(-11.0, 11.0, aBed.x), mix(-5.5, 6.0, aBed.y), mix(-7.0, 2.0, aBed.z));
  float tier = aBed.w;
  vec2 dir = uWind + uBurstDir * uBurst * (1.0 + tier * 2.0);
  float speed = (0.25 + aBed.x * 0.6) * (1.0 + tier * uBurst * 2.2);
  vec3 p = base + vec3(dir * uTime * speed, 0.0);
  p.x += sin(uTime * (0.5 + aBed.y) + aBed.z * 20.0) * 0.35;
  p.y += cos(uTime * (0.4 + aBed.z) + aBed.x * 20.0) * 0.25;
  p.x = mod(p.x + 11.0, 22.0) - 11.0;
  p.y = mod(p.y + 5.5, 11.5) - 5.5;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  float size = uSize * (0.6 + aBed.y * 0.9) * (1.0 + tier * uBurst * 0.9);
  // Frozen dust is suspended, not gone: each mote swells into a hard cold
  // speck, so the stalemate reads as held rather than as an empty frame.
  size *= 1.0 + uFreeze * 0.55;
  gl_PointSize = size * (250.0 / max(-view.z, 0.5));
  vCol = mix(mix(uMoteA, uMoteB, aHueMix), uWarmColor, uWarm * 0.45);
  // The terminator claims the dust too: cold ash left of it, warm sparks right.
  float sideMix = step(0.0, p.x);
  vCol = mix(vCol, vCol * vec3(0.45, 0.55, 0.75), uDivide * (1.0 - sideMix) * 0.75);
  vCol = mix(vCol, uWarmColor, uDivide * sideMix * 0.3);
  vCol = mix(vCol, uFrostColor, uFreeze * 0.65);
  // Dust reads as dust, not as bokeh. These are soft 40px blobs at this camera
  // distance and there are hundreds of them — with halation on the frame they
  // will bury the island if they are allowed anything like a full alpha.
  vA = (0.4 + aBed.z * 0.5) * mix(0.16, min(uBurst * 1.4, 1.0), tier);
  vA *= 1.0 + uFreeze * 0.5;
  gl_Position = projectionMatrix * view;
}
`;

const MOTE_FRAG = `
precision highp float;
uniform float uExposure;
varying vec3 vCol;
varying float vA;
${SRGB_DECODE}
void main() {
  vec2 c = gl_PointCoord - 0.5;
  // Tight core, short skirt. A wide smoothstep here is what turned the dust
  // into a field of soft gold discs the moment halation went on the frame.
  float d = smoothstep(0.5, 0.16, length(c));
  d *= d * d;
  gl_FragColor = vec4(toLinear(vCol * uExposure), d * vA);
}
`;

/**
 * FALLING WEATHER — the ash of the fall and the rising sparks of the dawn.
 * One shader, one direction uniform: uFlow pushes them down (ash) or up
 * (sparks), and uSpread decides whether they blow across the frame or column
 * straight off the plateau. Wraps in a tall box around the island.
 */
const WEATHER_VERT = `
precision highp float;
attribute vec4 aBed;   // x, y, z, seed
uniform float uTime, uAmount, uSize, uFlow, uSpread, uSpan;
uniform vec3 uColorA, uColorB;
varying vec3 vCol;
varying float vA;
void main() {
  float seed = aBed.w;
  float speed = 0.6 + seed * 1.9;
  vec3 p = vec3(mix(-uSpan, uSpan, aBed.x), 0.0, mix(-uSpan * 0.7, uSpan * 0.5, aBed.z));
  float span = 17.0;
  // Travel is one-way and wrapped, so density stays flat however long we hold.
  float travel = mod(aBed.y * span + uTime * speed * uFlow * uAmount, span);
  p.y = uFlow > 0.0 ? -5.5 + travel : 8.5 - travel;
  p.x += sin(uTime * (0.4 + seed) + seed * 30.0) * uSpread * (0.6 + seed);
  p.z += cos(uTime * (0.3 + seed * 0.7) + seed * 18.0) * uSpread * 0.5;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.45 + seed * 1.1) * (260.0 / max(-view.z, 0.5));
  vCol = mix(uColorA, uColorB, seed);
  // Fade in and out at both ends of the run — nothing pops into existence.
  float edge = smoothstep(0.0, 0.14, travel / span) * (1.0 - smoothstep(0.82, 1.0, travel / span));
  vA = uAmount * edge * (0.32 + seed * 0.68);
  gl_Position = projectionMatrix * view;
}
`;

const WEATHER_FRAG = `
precision highp float;
uniform float uExposure, uSoft;
varying vec3 vCol;
varying float vA;
${SRGB_DECODE}
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = smoothstep(0.5, uSoft, length(c));
  gl_FragColor = vec4(toLinear(vCol * uExposure), d * d * vA);
}
`;

/** The lens: vignette, flash, black, halation — composited over everything. */
const LENS_FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uFlash, uBlack, uVign, uGlow, uStreak, uAspect;
uniform vec3 uGlowColor;
uniform vec2 uGlowCenter;
${SRGB_DECODE}
void main() {
  float d = length((vUv - vec2(0.5, 0.5)) * vec2(uAspect, 1.0));
  float vign = smoothstep(0.68, 1.34, d) * uVign;
  float black = 1.0 - (1.0 - uBlack) * (1.0 - vign);
  float a = 1.0 - (1.0 - black) * (1.0 - uFlash);
  vec3 col = vec3(a > 0.0001 ? uFlash / a : 0.0);
  float g = exp(-length((vUv - uGlowCenter) * vec2(uAspect, 1.0)) * 2.6) * uGlow;
  col = mix(col, uGlowColor, clamp(g, 0.0, 1.0) * 0.8);
  a = 1.0 - (1.0 - a) * (1.0 - g * 0.5);
  // Anamorphic streak: a horizontal flare line that rides the big flashes.
  float s = exp(-abs(vUv.y - uGlowCenter.y) * 30.0) * exp(-abs(vUv.x - uGlowCenter.x) * 2.0) * uStreak;
  col = mix(col, uGlowColor, clamp(s, 0.0, 1.0) * 0.9);
  a = 1.0 - (1.0 - a) * (1.0 - s * 0.7);
  gl_FragColor = vec4(toLinear(col), clamp(a, 0.0, 1.0));
}
`;

/** Soft radial glow for the worldheart / the far star. */
function makeGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.28, "rgba(255,255,255,0.5)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

/** Thin annulus for the triumph ring — victory's expanding shockwave. */
function makeRingTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.68, "rgba(255,255,255,0)");
  gradient.addColorStop(0.78, "rgba(255,255,255,0.85)");
  gradient.addColorStop(0.86, "rgba(255,255,255,0.3)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

/**
 * A light-wall: hot hairline core, soft falloff sideways, tapered at both
 * ends. Every shaft, seam, pillar, god-ray and light-fall in the finale wears
 * this. (There used to be a plain top-to-bottom gradient here as well, but a
 * texture with no falloff ACROSS its width draws a hard-edged rectangle —
 * which is exactly what a 30-unit god-ray looked like: a grey quad laid over
 * the corner of the frame.)
 */
function makeSeamTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const across = ctx.createLinearGradient(0, 0, 128, 0);
  across.addColorStop(0, "rgba(255,255,255,0)");
  across.addColorStop(0.4, "rgba(255,255,255,0.16)");
  across.addColorStop(0.485, "rgba(255,255,255,0.9)");
  across.addColorStop(0.5, "rgba(255,255,255,1)");
  across.addColorStop(0.515, "rgba(255,255,255,0.9)");
  across.addColorStop(0.6, "rgba(255,255,255,0.16)");
  across.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, 128, 256);
  // Taper the ends so the wall never shows a cut-off edge.
  const along = ctx.createLinearGradient(0, 0, 0, 256);
  along.addColorStop(0, "rgba(0,0,0,1)");
  along.addColorStop(0.22, "rgba(0,0,0,0)");
  along.addColorStop(0.78, "rgba(0,0,0,0)");
  along.addColorStop(1, "rgba(0,0,0,1)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = along;
  ctx.fillRect(0, 0, 128, 256);
  return new THREE.CanvasTexture(canvas);
}

/**
 * The stone's grade, patched into the shared MeshStandardMaterial so a fate
 * changes the WORLD ITSELF and not merely the light falling on it: victory
 * gilds it, bittersweet splits it down a line fixed in space, the fall leaves
 * embers in it, the stalemate takes it to cold glass.
 */
type StoneUniforms = {
  uGild: { value: number };
  uDivide: { value: number };
  uAsh: { value: number };
  uFrost: { value: number };
  uDawnCol: { value: THREE.Color };
  uEmberCol: { value: THREE.Color };
  uFrostCol: { value: THREE.Color };
};

function patchStone(material: THREE.Material, uniforms: StoneUniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vStoneWorld;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvStoneWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;"
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vStoneWorld;
uniform float uGild, uDivide, uAsh, uFrost;
uniform vec3 uDawnCol, uEmberCol, uFrostCol;`
      )
      // Hooked at opaque_fragment — before tone mapping, colour space and fog,
      // so the grade is part of the surface and the distance haze still sits
      // on top of it.
      .replace(
        "#include <opaque_fragment>",
        `#include <opaque_fragment>
{
  vec3 stone = gl_FragColor.rgb;
  // THE HALF-LIGHT is judged in WORLD space, so the line stays put while the
  // island holds under it — the spin is damped to near nothing for that fate.
  float warm = smoothstep(-0.5, 0.5, vStoneWorld.x);
  float cold = (1.0 - warm) * uDivide;
  float gild = uGild * mix(1.0, warm, uDivide);
  stone = mix(stone, stone * uDawnCol * 1.15 + uDawnCol * 0.03, gild * 0.55);
  // The lost half is DRAINED first and cooled second. A pure multiply left it
  // reading as "the same world, slightly bluer" under a strong themed key.
  float lumC = dot(stone, vec3(0.299, 0.587, 0.114));
  vec3 ashed = mix(vec3(lumC), vec3(0.4, 0.47, 0.66) * (lumC * 1.1 + 0.015), 0.55) * 0.62;
  stone = mix(stone, ashed, cold * 0.92);
  float ash = uAsh * mix(1.0, cold, uDivide);
  stone = mix(stone, stone * vec3(0.5, 0.46, 0.46) + uEmberCol * 0.07, ash * 0.75);
  float lum = dot(stone, vec3(0.299, 0.587, 0.114));
  stone = mix(stone, mix(vec3(lum), uFrostCol * (lum * 1.5 + 0.06), 0.45), uFrost * 0.68);
  gl_FragColor.rgb = stone;
}`
      );
  };
  material.customProgramCacheKey = () => "outro-stone";
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const MOTES = 1400;

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

    const disposables: Array<{ dispose: () => void }> = [];

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    // Bloom is a full extra pass at this resolution; 2x on a 4K TV buys nothing
    // the halation does not already smear over, and costs about half the frame.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0x000000, 1);
    renderer.toneMapping = THREE.NoToneMapping; // the grade is authored, not filmic
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(new THREE.Color(visual.fog), visual.fogDensity * 0.4);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 220);
    camera.position.set(0, 0.9, 11);

    const accent = new THREE.Color(visual.accent);
    const accentBright = new THREE.Color(visual.accentBright);
    const secondary = new THREE.Color(visual.secondary);
    const fog = new THREE.Color(visual.fog);
    const ambientColor = new THREE.Color(visual.ambient);
    const heartBase = new THREE.Color(`rgb(${visual.loom.heart})`);
    const dawnColor = new THREE.Color("#ffd894").lerp(accentBright, 0.3);
    const emberColor = new THREE.Color("#ff6a3c").lerp(accent, 0.25);
    const frostColor = new THREE.Color("#b9cfe6");
    const riftColor = secondary.clone().lerp(new THREE.Color("#ffffff"), 0.18);

    /* -------- halation: the whole frame blooms -------- */
    // Everything downstream of here is authored to bloom — the worldheart, the
    // sun, the seams, the rift. The composer is what makes a light look like a
    // light instead of a bright polygon.
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // Threshold high and radius tight ON PURPOSE. A loose bloom turns 1400
    // additive dust motes into a field of gold bokeh that eats the island —
    // only genuine light sources (the heart, the sun, the seams) should smear.
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.4, 0.9);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    /** Movement `bloom` values read as multipliers of a sane baseline. */
    const BLOOM_BASE = 0.5;

    /* -------- the sky -------- */
    const fullscreen = new THREE.PlaneGeometry(2, 2);
    const skyUniforms = {
      uTime: { value: 0 },
      uRaw: { value: 0 },
      uExposure: { value: 1 },
      uDesat: { value: garnish.mono },
      uTintAmt: { value: 0 },
      uStars: { value: garnish.stars },
      uHorizon: { value: garnish.horizon },
      uBars: { value: garnish.bars },
      uScan: { value: garnish.scan },
      uBreathe: { value: garnish.breathe },
      uAspect: { value: 16 / 9 },
      uDawn: { value: 0 },
      uDivide: { value: 0 },
      uEmber: { value: 0 },
      uWarp: { value: 0 },
      uLeakSky: { value: 0 },
      uFrost: { value: 0 },
      uSunPos: { value: new THREE.Vector2(0.5, -0.4) },
      uSkyTop: { value: fog.clone().multiplyScalar(0.35) },
      uSkyBot: { value: fog.clone().lerp(ambientColor, 0.55).multiplyScalar(1.15) },
      uNeb0: { value: new THREE.Color(visual.nebulae[0]) },
      uNeb1: { value: new THREE.Color(visual.nebulae[1]) },
      uNeb2: { value: new THREE.Color(visual.nebulae[2]) },
      uTint: { value: new THREE.Color(movement.tint) },
      uHorizonColor: { value: accent.clone().lerp(new THREE.Color(visual.nebulae[1]), 0.4) },
      uDawnColor: { value: dawnColor.clone() },
      uEmberColor: { value: emberColor.clone() },
      uLeakColor: { value: secondary.clone() },
      uFrostColor: { value: frostColor.clone() }
    };
    const sky = new THREE.Mesh(
      fullscreen,
      new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERT, fragmentShader: BACKDROP_FRAG, uniforms: skyUniforms, depthTest: false, depthWrite: false })
    );
    sky.renderOrder = -1;
    sky.frustumCulled = false;
    scene.add(sky);
    disposables.push(fullscreen, sky.material as THREE.Material);

    /* -------- the cloud sea: the drop the island floats over -------- */
    // The Weaving forges an island in a void, which is fine while it is being
    // built. A finale needs a HEIGHT — something for the fall to fall into and
    // for the dawn to break over. This deck, far below and lit by whatever the
    // fate is lit by, is that height.
    const cloudUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uDawn: { value: 0 },
      uEmber: { value: 0 },
      uLeak: { value: 0 },
      uFrost: { value: 0 },
      uDivide: { value: 0 },
      uBase: { value: fog.clone().lerp(ambientColor, 0.5).multiplyScalar(1.35) },
      uDawnColor: { value: dawnColor.clone() },
      uEmberColor: { value: emberColor.clone() },
      uLeakColor: { value: secondary.clone() },
      uFrostColor: { value: frostColor.clone() }
    };
    const cloudGeometry = new THREE.PlaneGeometry(150, 150, 1, 1);
    const cloudMaterial = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      uniforms: cloudUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const cloudSea = new THREE.Mesh(cloudGeometry, cloudMaterial);
    cloudSea.rotation.x = -Math.PI / 2;
    cloudSea.position.set(0, -13, -14);
    cloudSea.renderOrder = 0;
    scene.add(cloudSea);
    disposables.push(cloudGeometry, cloudMaterial);

    /* -------- the island, imported from the WorldForge -------- */
    const world = new THREE.Group();
    world.position.set(0, -0.4, 0);
    scene.add(world);

    // The grade the fates write onto the stone itself (see patchStone).
    const stoneUniforms: StoneUniforms = {
      uGild: { value: 0 },
      uDivide: { value: 0 },
      uAsh: { value: 0 },
      uFrost: { value: 0 },
      uDawnCol: { value: dawnColor.clone() },
      uEmberCol: { value: emberColor.clone() },
      uFrostCol: { value: frostColor.clone() }
    };

    const matter = new THREE.MeshStandardMaterial({
      color: new THREE.Color(visual.loom.world),
      roughness: 0.5,
      metalness: 0.4,
      flatShading: true,
      emissive: accent.clone(),
      emissiveIntensity: 0.05,
      transparent: true,
      opacity: 0
    });
    patchStone(matter, stoneUniforms);
    const wireMaterial = new THREE.LineBasicMaterial({
      color: accent.clone(),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    disposables.push(matter, wireMaterial);

    type FateMesh = {
      mesh: THREE.Mesh;
      home: THREE.Vector3;
      homeRot: THREE.Euler;
      out: THREE.Vector3; //   which way this piece calves
      order: number; //        when it goes, 0..1 (2 = never)
      tumble: number;
      float: boolean;
      side: number; //         -1 falls first under `divide`, +1 is the dawn side
    };
    const fated: FateMesh[] = [];

    const buildLandmark = (def: LandmarkDef, at: [number, number], order: number, isIsland: boolean) => {
      for (const prim of def.prims) {
        const geometry = makeGeometry(prim);
        if (!geometry) continue;
        const mesh = new THREE.Mesh(geometry, matter);
        const px = (prim.p?.[0] ?? 0) + at[0];
        const py = prim.p?.[1] ?? 0;
        const pz = (prim.p?.[2] ?? 0) + at[1];
        mesh.position.set(px, py, pz);
        if (prim.r) mesh.rotation.set(...prim.r);
        world.add(mesh);
        const edges = new THREE.EdgesGeometry(geometry, 12);
        const wire = new THREE.LineSegments(edges, wireMaterial);
        mesh.add(wire);
        disposables.push(geometry, edges);
        const out = new THREE.Vector3(px, 0, pz);
        if (out.lengthSq() < 0.04) out.set(0.3, 0, 0.2);
        out.normalize();
        fated.push({
          mesh,
          home: mesh.position.clone(),
          homeRot: mesh.rotation.clone(),
          out,
          order: isIsland ? 2 : order,
          tumble: (Math.random() - 0.5) * 2.4,
          float: !!def.float,
          side: px < -0.15 ? -1 : 1
        });
      }
    };

    // The island itself never falls; it is what is left.
    buildLandmark(ISLAND, [0, 0], 2, true);
    const kit = KITS[visual.key] || KITS.none;
    kit.forEach((def, index) => {
      // Landmark 0 is the hero slot — what the party built holds to the last.
      const order = index === 0 ? 0.93 : 0.12 + ((index * 0.61) % 1) * 0.62;
      buildLandmark(def, SLOTS[index] || [0, 0], order, false);
    });

    /* -------- sibling islands: the world is bigger than this rock -------- */
    // Silhouettes only, deep in the haze, at four depths. They cost almost
    // nothing and they are the difference between a prop on a black card and
    // somewhere the saga could plausibly have happened.
    const siblingMaterial = new THREE.MeshStandardMaterial({
      color: fog.clone().lerp(new THREE.Color(visual.loom.world), 0.55),
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
      transparent: true,
      opacity: 0
    });
    disposables.push(siblingMaterial);
    const siblings: Array<{ group: THREE.Group; baseY: number; spin: number }> = [];
    ([
      [-19, 3.4, -34, 0.5],
      [24, -5.5, -46, 0.72],
      [-31, -9, -62, 1.05],
      [13, 7.2, -74, 0.85]
    ] as Array<[number, number, number, number]>).forEach(([sx, sy, sz, ss], index) => {
      const group = new THREE.Group();
      for (const prim of ISLAND.prims) {
        const geometry = makeGeometry(prim);
        if (!geometry) continue;
        const mesh = new THREE.Mesh(geometry, siblingMaterial);
        mesh.position.set(prim.p?.[0] ?? 0, prim.p?.[1] ?? 0, prim.p?.[2] ?? 0);
        if (prim.r) mesh.rotation.set(...prim.r);
        group.add(mesh);
        disposables.push(geometry);
      }
      // One landmark apiece so they read as inhabited, not as bare rocks.
      const def = kit[(index + 1) % kit.length];
      if (def) {
        for (const prim of def.prims.slice(0, 2)) {
          const geometry = makeGeometry(prim);
          if (!geometry) continue;
          const mesh = new THREE.Mesh(geometry, siblingMaterial);
          mesh.position.set(prim.p?.[0] ?? 0, prim.p?.[1] ?? 0, prim.p?.[2] ?? 0);
          group.add(mesh);
          disposables.push(geometry);
        }
      }
      group.position.set(sx, sy, sz);
      group.scale.setScalar(ss);
      group.rotation.y = index * 1.7;
      scene.add(group);
      siblings.push({ group, baseY: sy, spin: index * 1.7 });
    });

    /* -------- the worldheart -------- */
    const glowTexture = makeGlowTexture();
    const heartMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: heartBase.clone(),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    const heart = new THREE.Sprite(heartMaterial);
    heart.position.set(0, 1.1, 0);
    world.add(heart);
    disposables.push(glowTexture, heartMaterial);
    const heartLight = new THREE.PointLight(heartBase.clone(), 0, 18, 1.8);
    heartLight.position.set(0, 1.4, 0);
    world.add(heartLight);

    /* -------- the leak (cliffhanger's wrong light) -------- */
    const seamTexture = makeSeamTexture();
    disposables.push(seamTexture);
    const beamMaterial = new THREE.SpriteMaterial({
      map: seamTexture,
      color: secondary.clone(),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    const beam = new THREE.Sprite(beamMaterial);
    beamMaterial.depthTest = false; // the wrong light shines through everything
    beam.scale.set(1.7, 5.2, 1);
    beam.position.set(0.9, 1.1, 0.6);
    world.add(beam);
    disposables.push(beamMaterial);
    const leakLight = new THREE.PointLight(secondary.clone(), 0, 16, 1.6);
    leakLight.position.set(0.6, -0.4, 0.9);
    world.add(leakLight);

    /* -------- two lesser seams: the cliffhanger's crack is not alone -------- */
    const seamMaterials: THREE.SpriteMaterial[] = [];
    const seamSpots: Array<[number, number, number, number]> = [
      [-1.5, 0.7, -0.9, 3.4],
      [0.2, 0.9, 1.5, 4.4]
    ];
    for (const [sx, sy, sz, sh] of seamSpots) {
      const seamMaterial = new THREE.SpriteMaterial({
        map: seamTexture, color: secondary.clone(), transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false
      });
      const seam = new THREE.Sprite(seamMaterial);
      seam.scale.set(1.0, sh, 1);
      seam.position.set(sx, sy, sz);
      world.add(seam);
      seamMaterials.push(seamMaterial);
      disposables.push(seamMaterial);
    }

    /* -------- the dawn made literal: a sun that climbs behind the island -------- */
    const sunGroup = new THREE.Group();
    sunGroup.position.set(4.6, -4.4, -13);
    scene.add(sunGroup);
    const sunHaloMaterial = new THREE.SpriteMaterial({
      map: glowTexture, color: dawnColor.clone(), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    });
    const sunHalo = new THREE.Sprite(sunHaloMaterial);
    sunHalo.scale.set(11, 11, 1);
    sunGroup.add(sunHalo);
    const sunCoreMaterial = new THREE.SpriteMaterial({
      map: glowTexture, color: new THREE.Color("#fff3d6"), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    });
    const sunCore = new THREE.Sprite(sunCoreMaterial);
    sunCore.scale.set(3.6, 3.6, 1);
    sunGroup.add(sunCore);
    disposables.push(sunHaloMaterial, sunCoreMaterial);
    const rayBase: number[] = [];
    const rayMaterials: THREE.SpriteMaterial[] = [];
    for (let i = 0; i < 9; i += 1) {
      const rotation = Math.PI + (i - 4) * 0.3;
      const rayMaterial = new THREE.SpriteMaterial({
        map: seamTexture, color: dawnColor.clone(), transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false, rotation
      });
      const ray = new THREE.Sprite(rayMaterial);
      ray.scale.set(1.4 + (i % 3) * 0.9, 30, 1);
      sunGroup.add(ray);
      rayBase.push(rotation);
      rayMaterials.push(rayMaterial);
      disposables.push(rayMaterial);
    }

    // Rings (triumph, and the stalemate's half-finished one) live in the rigs.
    const ringTexture = makeRingTexture();
    disposables.push(ringTexture);

    /* -------- the cracks: defeat's ember fissures / the cliffhanger's seams -------- */
    const crackColor =
      kind === "cliffhanger"
        ? secondary.clone().lerp(new THREE.Color("#ffffff"), 0.15)
        : new THREE.Color("#ff7a45").lerp(accent, 0.2);
    const crackMaterial = new THREE.LineBasicMaterial({
      color: crackColor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    });
    {
      const points: THREE.Vector3[] = [];
      const branches = kind === "bittersweet" ? 6 : 9;
      for (let b = 0; b < branches; b += 1) {
        // Bittersweet only fractures the falling (-x) half of the plateau.
        let angle = kind === "bittersweet" ? Math.PI * (0.55 + (b / branches) * 0.9) : (b / branches) * Math.PI * 2 + Math.random() * 0.5;
        let radius = 0.3 + Math.random() * 0.4;
        let prev = new THREE.Vector3(Math.cos(angle) * radius, 0.045, Math.sin(angle) * radius);
        while (radius < 3.9) {
          radius += 0.45 + Math.random() * 0.5;
          angle += (Math.random() - 0.5) * 0.55;
          const capped = Math.min(radius, 3.95);
          const next = new THREE.Vector3(Math.cos(angle) * capped, 0.045, Math.sin(angle) * capped);
          points.push(prev, next);
          prev = next;
        }
      }
      const crackGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const cracks = new THREE.LineSegments(crackGeometry, crackMaterial);
      world.add(cracks);
      disposables.push(crackGeometry, crackMaterial);
    }

    /* -------- the worldheart's roots: crystals under the crag, a void glow -------- */
    const crystalGeometry = new THREE.OctahedronGeometry(0.3, 0);
    const crystalMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(visual.loom.world), roughness: 0.35, metalness: 0.5, flatShading: true,
      emissive: heartBase.clone(), emissiveIntensity: 0.4, transparent: true, opacity: 0
    });
    patchStone(crystalMaterial, stoneUniforms);
    for (let i = 0; i < 6; i += 1) {
      const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
      const angle = (i / 6) * Math.PI * 2 + 0.4;
      const radius = 1.0 + (i % 3) * 0.55;
      crystal.position.set(Math.cos(angle) * radius, -1.9 - (i % 4) * 0.5, Math.sin(angle) * radius);
      crystal.scale.setScalar(0.7 + ((i * 0.37) % 1) * 0.9);
      crystal.rotation.set(i, i * 1.7, 0);
      world.add(crystal);
    }
    disposables.push(crystalGeometry, crystalMaterial);
    const voidMaterial = new THREE.SpriteMaterial({
      map: glowTexture, color: heartBase.clone(), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    });
    const voidGlow = new THREE.Sprite(voidMaterial);
    voidGlow.scale.set(9.5, 4.6, 1);
    voidGlow.position.set(0, -4.4, 0);
    world.add(voidGlow);
    disposables.push(voidMaterial);

    /* -------- light-falls off the rim: thin luminous waterfalls -------- */
    const fallMaterials: THREE.SpriteMaterial[] = [];
    const fallSpots: Array<[number, number]> = [[3.5, -0.8], [-3.0, 1.6], [0.7, 3.5]];
    for (const [fx, fz] of fallSpots) {
      const fallMaterial = new THREE.SpriteMaterial({
        map: seamTexture, color: accentBright.clone(), transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false, rotation: Math.PI
      });
      const fall = new THREE.Sprite(fallMaterial);
      fall.scale.set(0.75, 3.4, 1);
      fall.position.set(fx, -2.3, fz);
      world.add(fall);
      fallMaterials.push(fallMaterial);
      disposables.push(fallMaterial);
    }

    /* -------- the balance: two opposed pillars for the stalemate -------- */
    const pillarMaterials: THREE.SpriteMaterial[] = [];
    const pillarLights: THREE.PointLight[] = [];
    ([[5.8, accent], [-5.8, secondary]] as Array<[number, THREE.Color]>).forEach(([px, color]) => {
      const pillarMaterial = new THREE.SpriteMaterial({
        map: seamTexture, color: color.clone().lerp(new THREE.Color("#ffffff"), 0.2), transparent: true,
        opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      });
      const pillar = new THREE.Sprite(pillarMaterial);
      // Short enough to have visible ENDS inside the aperture — a pillar that
      // runs off both edges of frame is just a stripe.
      pillar.scale.set(1.5, 9.6, 1);
      pillar.position.set(px, 1.1, -2.5);
      scene.add(pillar);
      pillarMaterials.push(pillarMaterial);
      disposables.push(pillarMaterial);
      const pillarLight = new THREE.PointLight(color.clone(), 0, 20, 1.8);
      pillarLight.position.set(px * 0.75, 1.6, 1.5);
      scene.add(pillarLight);
      pillarLights.push(pillarLight);
    });

    /* -------- the leaving: a light-smear the world drags behind it -------- */
    const tailMaterial = new THREE.SpriteMaterial({
      map: glowTexture, color: accentBright.clone().lerp(new THREE.Color("#ffffff"), 0.3), transparent: true,
      opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    });
    const tail = new THREE.Sprite(tailMaterial);
    tail.position.set(0, 1.1, 2.2);
    world.add(tail);
    disposables.push(tailMaterial);

    /* ================================================================== */
    /* THE RIGS — one fate, one apparatus                                  */
    /* ================================================================== */
    /**
     * Only the running fate's rig is built. Each returns a tick that is called
     * once per frame AFTER the shared world has been posed, so a rig is free
     * to shove the island around (the fall sinks it, the crack glitches it).
     */
    type RigTick = (t: number, dt: number, ctx: Ctx, c: Targets) => void;
    const rigs: RigTick[] = [];

    /** A one-way, wrapping curtain of particles: ashfall down, sparks up. */
    const makeWeather = (opts: {
      count: number;
      colorA: THREE.Color;
      colorB: THREE.Color;
      flow: number; //   +1 falls, -1 rises
      spread: number;
      size: number;
      span: number;
      soft: number;
    }) => {
      const geometry = new THREE.BufferGeometry();
      const bed = new Float32Array(opts.count * 4);
      const dummy = new Float32Array(opts.count * 3);
      for (let i = 0; i < opts.count; i += 1) {
        bed[i * 4] = Math.random();
        bed[i * 4 + 1] = Math.random();
        bed[i * 4 + 2] = Math.random();
        bed[i * 4 + 3] = Math.random();
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(dummy, 3));
      geometry.setAttribute("aBed", new THREE.BufferAttribute(bed, 4));
      const uniforms = {
        uTime: { value: 0 },
        uAmount: { value: 0 },
        uSize: { value: opts.size },
        uFlow: { value: opts.flow },
        uSpread: { value: opts.spread },
        uSpan: { value: opts.span },
        uSoft: { value: opts.soft },
        uExposure: { value: 1 },
        uColorA: { value: opts.colorA.clone() },
        uColorB: { value: opts.colorB.clone() }
      };
      const material = new THREE.ShaderMaterial({
        vertexShader: WEATHER_VERT,
        fragmentShader: WEATHER_FRAG,
        uniforms,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        blending: opts.flow < 0 ? THREE.AdditiveBlending : THREE.NormalBlending
      });
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      points.renderOrder = 1;
      disposables.push(geometry, material);
      return { points, uniforms };
    };

    const additiveSprite = (map: THREE.Texture, color: THREE.Color, sx: number, sy: number, rotation = 0) => {
      const material = new THREE.SpriteMaterial({
        map, color: color.clone(), transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, rotation
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(sx, sy, 1);
      disposables.push(material);
      return { sprite, material };
    };

    /* ---- THE DAWN: light comes up out of the world it saved ---- */
    if (kind === "victory" || kind === "bittersweet") {
      // A shaft standing off every landmark — the world exhaling light.
      const shafts = SLOTS.map(([sx, sz]) => {
        const { sprite, material } = additiveSprite(seamTexture, dawnColor, 1.0, 7.0);
        sprite.position.set(sx, 3.4, sz);
        world.add(sprite);
        return { sprite, material, side: sx < -0.15 ? -1 : 1 };
      });
      // Sparks streaming up off the plateau.
      const sparks = makeWeather({
        count: 460, colorA: dawnColor, colorB: new THREE.Color("#fff4d8"),
        flow: -1, spread: 0.55, size: 0.5, span: 5.2, soft: 0.24
      });
      world.add(sparks.points);
      // Three staggered triumph rings instead of one lonely shockwave.
      const rings = [0, 0.16, 0.34].map((delay) => {
        const { sprite, material } = additiveSprite(ringTexture, accentBright.clone().lerp(new THREE.Color("#ffffff"), 0.5), 2, 2);
        sprite.position.set(0, 1.1, 0);
        world.add(sprite);
        return { sprite, material, delay };
      });
      // Flare ghosts riding the axis from the sun through the frame centre.
      const ghosts = [0.35, 0.62, 0.95, 1.35].map((along, i) => {
        const { sprite, material } = additiveSprite(glowTexture, i % 2 ? dawnColor : accentBright, 1.4 + i * 0.5, 1.4 + i * 0.5);
        scene.add(sprite);
        return { sprite, material, along, size: 1.4 + i * 0.5 };
      });
      const sunAt = new THREE.Vector3();
      rigs.push((t, _dt, ctx, c) => {
        for (const shaft of shafts) {
          const sideGate = c.divide > 0.05 ? (shaft.side > 0 ? 1 : 0) : 1;
          shaft.material.opacity = Math.pow(c.gild, 1.4) * 0.5 * sideGate * (1 - c.veil * 0.45) * c.presence;
          const rise = 5.0 + c.gild * 5.5;
          shaft.sprite.scale.set(0.85 + c.gild * 0.5, rise, 1);
          shaft.sprite.position.y = 1.4 + rise * 0.42;
        }
        sparks.uniforms.uTime.value = t;
        sparks.uniforms.uAmount.value = Math.pow(c.gild, 1.3) * (0.55 + c.burst * 0.9) * (1 - c.veil * 0.4);
        // The rings only break on the beat the sun clears the plateau.
        for (const ring of rings) {
          const p = ctx.id === "fin" ? Math.max(0, ctx.p - ring.delay) / Math.max(1 - ring.delay, 0.01) : 0;
          const spread = 1.6 + p * (kind === "victory" ? 15 : 10);
          ring.sprite.scale.set(spread, spread, 1);
          ring.material.opacity = p > 0 ? Math.sin(Math.min(p * 1.1, 1) * Math.PI) * (1 - p) * (kind === "victory" ? 0.9 : 0.45) : 0;
        }
        sunAt.copy(sunGroup.position).project(camera);
        for (const ghost of ghosts) {
          // Ghosts sit on the line through the lens centre, opposite the sun.
          const gx = -sunAt.x * ghost.along;
          const gy = -sunAt.y * ghost.along;
          ghost.sprite.position.set(gx * 7.5, gy * 4.6 + 0.8, 4.5);
          ghost.material.opacity = Math.pow(c.dawn, 2.2) * 0.16 * (1 - c.veil * 0.7);
          const s = ghost.size * (0.7 + c.dawn * 0.7);
          ghost.sprite.scale.set(s, s, 1);
        }
      });
    }

    /* ---- THE FALL: a lightless maw opens and takes the world ---- */
    if (kind === "defeat" || kind === "bittersweet") {
      // The hole. A black ball below the crag that grows until it eats it —
      // the void in this finale had been an absence, and an absence cannot
      // swallow anything.
      const mawGeometry = new THREE.SphereGeometry(1, 24, 16);
      const mawMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, fog: false });
      const maw = new THREE.Mesh(mawGeometry, mawMaterial);
      maw.position.set(0, -6.5, 0);
      maw.renderOrder = 1;
      world.add(maw);
      disposables.push(mawGeometry, mawMaterial);
      // Its lip burns.
      const lip = additiveSprite(glowTexture, emberColor, 6, 6);
      lip.sprite.position.set(0, -6.5, 0);
      world.add(lip.sprite);
      // Embers in the fissures, seen from below the plateau.
      const underplate = additiveSprite(glowTexture, emberColor, 8.5, 2.4);
      underplate.sprite.position.set(0, -1.1, 0);
      world.add(underplate.sprite);
      // Flecks, not lens dirt: small and many. A soft 40px grey disc drifting
      // over the frame reads as a smudge on the glass, never as falling ash.
      const ash = makeWeather({
        count: 1100, colorA: new THREE.Color("#7b7b84"), colorB: new THREE.Color("#3a3a42"),
        flow: 1, spread: 0.9, size: 0.62, span: 13, soft: 0.3
      });
      scene.add(ash.points);
      const embers = makeWeather({
        count: 300, colorA: emberColor, colorB: new THREE.Color("#ffb070"),
        flow: -1, spread: 0.7, size: 0.55, span: 5.5, soft: 0.24
      });
      world.add(embers.points);
      rigs.push((t, _dt, _ctx, c) => {
        // Bittersweet only ever half-falls, so its maw stays a bruise.
        const bite = kind === "bittersweet" ? c.ruin * 0.45 : c.ruin;
        const grow = Math.max(0, (bite - 0.32) / 0.68);
        // Sized against the island (plateau radius ~4.3), not against the
        // frame: a maw wider than the shot is just a black screen.
        const size = 0.5 + grow * 3.1;
        maw.scale.setScalar(size);
        maw.position.y = -8.2 + grow * 2.1;
        mawMaterial.opacity = Math.min(1, grow * 2.2) * c.presence;
        lip.sprite.scale.set(size * 2.1, size * 1.3, 1);
        lip.sprite.position.y = maw.position.y + size * 0.85;
        lip.material.opacity = Math.min(1, grow * 1.6) * 0.32 * (0.7 + 0.3 * Math.sin(t * 1.7)) * (1 - c.veil * 0.4);
        // The island lit from below by its own fires is the shot for this
        // fate, so the underplate carries real weight rather than a hint.
        underplate.material.opacity = Math.min(1, c.ruin * 1.5) * 0.7 * (0.75 + 0.25 * Math.sin(t * 3.1)) * c.presence * (1 - c.veil * 0.5);
        underplate.sprite.scale.set(7.5 + c.ruin * 3, 2.2 + c.ruin * 1.6, 1);
        ash.uniforms.uTime.value = t;
        ash.uniforms.uAmount.value = c.ash * (1 - c.veil * 0.35);
        ash.uniforms.uExposure.value = 1;
        embers.uniforms.uTime.value = t;
        embers.uniforms.uAmount.value = Math.pow(Math.min(1, c.ruin * 1.4), 1.2) * (0.5 + c.burst) * (1 - c.veil * 0.4);
        // Past the point of no return the island itself goes down the hole,
        // and the worldheart is left hanging over nothing.
        if (kind === "defeat") {
          const swallow = Math.max(0, (c.ruin - 0.62) / 0.38);
          world.position.y -= swallow * 1.6;
          const shrink = 1 - swallow * 0.22;
          world.scale.multiplyScalar(shrink);
          heart.position.y = 1.1 + swallow * 2.2; // left hanging over the hole
        }
      });
    }

    /* ---- THE HALF-LIGHT: a wall of light standing on the line ---- */
    if (kind === "bittersweet") {
      const wall = additiveSprite(seamTexture, new THREE.Color("#fff4dc"), 2.4, 17);
      wall.sprite.position.set(0, 1.2, 0);
      world.add(wall.sprite);
      // …and the cut it leaves across the plateau.
      const cut = additiveSprite(seamTexture, new THREE.Color("#ffe9c4"), 0.7, 9.4, Math.PI / 2);
      cut.sprite.position.set(0, 0.08, 0);
      world.add(cut.sprite);
      const wallLight = new THREE.PointLight(new THREE.Color("#ffe3b0"), 0, 14, 2);
      wallLight.position.set(0, 1.6, 1.2);
      world.add(wallLight);
      rigs.push((t, _dt, _ctx, c) => {
        const breath = 0.85 + 0.15 * Math.sin(t * 1.3);
        wall.material.opacity = Math.pow(c.divide, 1.3) * 0.62 * breath * (1 - c.veil * 0.4) * c.presence;
        wall.sprite.scale.set(1.8 + c.dawn * 1.4, 15 + c.dawn * 5, 1);
        cut.material.opacity = Math.pow(c.divide, 1.5) * 0.5 * breath * (1 - c.veil * 0.5) * c.presence;
        wallLight.intensity = c.divide * 3.2 * breath;
      });
    }

    /* ---- THE LEAVING: the sky tears past and the world becomes a star ---- */
    if (kind === "escape") {
      const STREAKS = 190;
      const streakGeometry = new THREE.BufferGeometry();
      const streakPos = new Float32Array(STREAKS * 6);
      streakGeometry.setAttribute("position", new THREE.BufferAttribute(streakPos, 3));
      const streakMaterial = new THREE.LineBasicMaterial({
        color: accentBright.clone().lerp(new THREE.Color("#cfe9ff"), 0.6),
        transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      });
      const streaks = new THREE.LineSegments(streakGeometry, streakMaterial);
      streaks.frustumCulled = false;
      scene.add(streaks);
      disposables.push(streakGeometry, streakMaterial);
      const lanes = Array.from({ length: STREAKS }, () => {
        const angle = Math.random() * Math.PI * 2;
        const radius = 2.2 + Math.pow(Math.random(), 0.6) * 13;
        return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.72 + 0.8, z: -34 + Math.random() * 52, speed: 0.7 + Math.random() * 0.9 };
      });
      // The world's own light, drawn out into a cross-flared star.
      const starCore = additiveSprite(glowTexture, accentBright.clone().lerp(new THREE.Color("#ffffff"), 0.5), 1, 1);
      starCore.sprite.position.set(0, 1.1, 0);
      world.add(starCore.sprite);
      const flareH = additiveSprite(seamTexture, accentBright.clone().lerp(new THREE.Color("#dff2ff"), 0.5), 0.9, 9, Math.PI / 2);
      const flareV = additiveSprite(seamTexture, accentBright.clone().lerp(new THREE.Color("#dff2ff"), 0.5), 0.7, 6);
      flareH.sprite.position.set(0, 1.1, 0);
      flareV.sprite.position.set(0, 1.1, 0);
      world.add(flareH.sprite, flareV.sprite);
      rigs.push((_t, dt, _ctx, c) => {
        const rush = Math.pow(c.recede, 1.15);
        streakMaterial.opacity = rush * 0.62;
        const length = 0.5 + rush * 11;
        for (let i = 0; i < STREAKS; i += 1) {
          const lane = lanes[i];
          lane.z += dt * (3 + rush * 150) * lane.speed;
          if (lane.z > 20) lane.z -= 56;
          streakPos[i * 6] = lane.x;
          streakPos[i * 6 + 1] = lane.y;
          streakPos[i * 6 + 2] = lane.z;
          streakPos[i * 6 + 3] = lane.x;
          streakPos[i * 6 + 4] = lane.y;
          streakPos[i * 6 + 5] = lane.z + length;
        }
        streakGeometry.attributes.position.needsUpdate = true;
        // The flare only resolves once the world is genuinely far away.
        // A STAR, not a sunrise. The world has to end up small enough that the
        // island is still a readable silhouette inside its own glare.
        const far = Math.pow(Math.max(0, (c.recede - 0.55) / 0.45), 1.4);
        const core = 1.4 + far * 5.5;
        starCore.sprite.scale.set(core, core, 1);
        starCore.material.opacity = far * 0.7;
        flareH.sprite.scale.set(1.2 + far * 1.6, 14 + far * 30, 1);
        flareV.sprite.scale.set(0.9 + far * 1.1, 8 + far * 15, 1);
        flareH.material.opacity = far * 0.4;
        flareV.material.opacity = far * 0.26;
      });
    }

    /* ---- THE STILLNESS: a scale, level, and time stopped on it ---- */
    if (kind === "draw") {
      // The beam runs dead level through the island between the two pillars.
      const level = additiveSprite(seamTexture, frostColor.clone().lerp(new THREE.Color("#ffffff"), 0.4), 1.1, 19, Math.PI / 2);
      level.sprite.position.set(0, 1.5, 0);
      scene.add(level.sprite);
      // Pans: a short cross-beam capping each pillar, level with the other.
      const pans = [5.8, -5.8].map((px) => {
        const { sprite, material } = additiveSprite(seamTexture, frostColor, 0.6, 3.4, Math.PI / 2);
        sprite.position.set(px, 5.6, -2.5);
        scene.add(sprite);
        return { sprite, material };
      });
      // A ring caught half-expanded and left there. Nothing says stopped like
      // a shockwave that never finished.
      const held = additiveSprite(ringTexture, frostColor.clone().lerp(new THREE.Color("#ffffff"), 0.35), 2, 2);
      held.sprite.position.set(0, 1.1, 0);
      world.add(held.sprite);
      rigs.push((t, _dt, _ctx, c) => {
        const balance = Math.max(0, (c.still - 0.3) / 0.7);
        level.material.opacity = balance * 0.5 * (1 - c.veil * 0.5);
        level.sprite.scale.set(0.8 + balance * 0.8, 14 + balance * 8, 1);
        // The scale rocks, twice, less each time — then rests exactly even.
        const settle = Math.exp(-balance * 5.5);
        const tilt = Math.sin(t * 1.6) * 0.05 * settle;
        level.sprite.position.set(0, 1.5 + tilt * 6, 0);
        for (let i = 0; i < pans.length; i += 1) {
          pans[i].material.opacity = balance * 0.45 * (1 - c.veil * 0.5);
          pans[i].sprite.position.y = 5.6 + (i === 0 ? tilt : -tilt) * 7;
        }
        // Expand, then freeze wherever the freeze caught it.
        const reach = Math.min(balance, 0.62) * 11;
        held.sprite.scale.set(1.6 + reach, 1.6 + reach, 1);
        held.material.opacity = Math.min(balance * 1.6, 1) * 0.25 * (1 - c.veil * 0.5);
      });
    }

    /* ---- THE CRACK: a tear behind the world, and a pulse under it ---- */
    if (kind === "cliffhanger") {
      const riftUniforms = {
        uTime: { value: 0 },
        uOpen: { value: 0 },
        uCore: { value: new THREE.Color("#ffffff").lerp(secondary, 0.25) },
        uEdge: { value: riftColor.clone() }
      };
      const riftGeometry = new THREE.PlaneGeometry(13, 24);
      const riftMaterial = new THREE.ShaderMaterial({
        vertexShader: CLOUD_VERT,
        fragmentShader: RIFT_FRAG,
        uniforms: riftUniforms,
        transparent: true,
        depthWrite: false,
        // Depth-tested on purpose: the tear is BEHIND the world, so the island
        // eclipses it and reads as a silhouette cut out of the wrong light.
        depthTest: true,
        blending: THREE.AdditiveBlending
      });
      const rift = new THREE.Mesh(riftGeometry, riftMaterial);
      rift.position.set(1.1, 1.5, -11);
      rift.renderOrder = 0;
      rift.frustumCulled = false;
      scene.add(rift);
      disposables.push(riftGeometry, riftMaterial);
      // Something under the crag has a heartbeat.
      const pulse = additiveSprite(glowTexture, riftColor, 5, 5);
      pulse.sprite.position.set(0, -3.4, 0);
      world.add(pulse.sprite);
      const pulseLight = new THREE.PointLight(secondary.clone(), 0, 22, 1.7);
      pulseLight.position.set(0, -2.6, 0.6);
      world.add(pulseLight);
      const glitched = fated.filter((_, i) => i % 3 === 1);
      rigs.push((t, _dt, _ctx, c) => {
        riftUniforms.uTime.value = t;
        riftUniforms.uOpen.value = Math.pow(c.rift, 1.15) * (1 - c.veil * 0.55);
        rift.scale.set(0.5 + c.rift * 0.5, 0.6 + c.rift * 0.4, 1);
        // Two thumps and a rest — a heartbeat, not a sine.
        const beat = (t * 0.85) % 1;
        const thump = Math.exp(-beat * 14) + Math.exp(-Math.max(beat - 0.19, 0) * 16) * 0.6;
        pulse.material.opacity = c.leak * (0.3 + thump * 0.7) * 0.7 * c.presence * (1 - c.veil * 0.4);
        const ps = 4 + c.leak * 5 + thump * 1.4;
        pulse.sprite.scale.set(ps, ps * 0.8, 1);
        pulseLight.intensity = c.leak * (1.5 + thump * 5.5);
        // The world starts skipping frames of itself.
        if (c.leak > 0.55) {
          const chance = (c.leak - 0.55) / 0.45;
          for (let i = 0; i < glitched.length; i += 1) {
            const f = glitched[i];
            const jump = Math.sin(t * (23 + i * 7)) > 1 - chance * 0.42;
            if (!jump) continue;
            f.mesh.position.x += Math.sin(t * 91 + i) * 0.42 * chance;
            f.mesh.position.y += Math.cos(t * 77 + i * 2) * 0.28 * chance;
          }
        }
      });
    }

    /* -------- lights -------- */
    const ambient = new THREE.AmbientLight(ambientColor, 0.75);
    scene.add(ambient);
    // Sky/ground bounce: the plateau reads as lit from above and cooled from
    // below rather than uniformly flat-shaded.
    const bounce = new THREE.HemisphereLight(ambientColor.clone(), fog.clone(), 0.5);
    scene.add(bounce);
    const key = new THREE.DirectionalLight(accentBright.clone(), 0.55);
    key.position.set(5, 6, 7);
    scene.add(key);
    const rim = new THREE.DirectionalLight(secondary.clone(), 0.35);
    rim.position.set(-6, 3, -4);
    scene.add(rim);
    // A cold back-light that separates the silhouette from the sky.
    const back = new THREE.DirectionalLight(frostColor.clone(), 0.3);
    back.position.set(-2, 5, -9);
    scene.add(back);

    /* -------- orbiting debris, same shapes the Weaving flies -------- */
    const debrisShape = DEBRIS_SHAPE[visual.key] || DEBRIS_SHAPE.none;
    const debris: Array<{ line: THREE.LineSegments; radius: number; y: number; seed: number; speed: number; angle: number }> = [];
    const debrisMaterial = new THREE.LineBasicMaterial({ color: accent.clone(), transparent: true, opacity: 0.28 });
    disposables.push(debrisMaterial);
    for (let i = 0; i < 16; i += 1) {
      const geometry = new THREE.EdgesGeometry(debrisShape(Math.random));
      const line = new THREE.LineSegments(geometry, debrisMaterial);
      world.add(line);
      debris.push({
        line,
        radius: 5.6 + Math.random() * 3.4,
        y: 0.4 + Math.random() * 3.4,
        seed: Math.random() * Math.PI * 2,
        speed: (0.12 + Math.random() * 0.2) * (i === 0 ? 1 : 1), // slot 0 is the cliffhanger's runaway
        angle: Math.random() * Math.PI * 2
      });
      disposables.push(geometry);
    }

    /* -------- motes -------- */
    const moteGeometry = new THREE.BufferGeometry();
    {
      const bed = new Float32Array(MOTES * 4);
      const hue = new Float32Array(MOTES);
      const dummy = new Float32Array(MOTES * 3);
      for (let i = 0; i < MOTES; i += 1) {
        bed[i * 4] = Math.random();
        bed[i * 4 + 1] = Math.random();
        bed[i * 4 + 2] = Math.random();
        bed[i * 4 + 3] = i / MOTES < 0.55 ? 0 : 1;
        hue[i] = Math.random();
      }
      moteGeometry.setAttribute("position", new THREE.BufferAttribute(dummy, 3));
      moteGeometry.setAttribute("aBed", new THREE.BufferAttribute(bed, 4));
      moteGeometry.setAttribute("aHueMix", new THREE.BufferAttribute(hue, 1));
    }
    const moteUniforms = {
      uTime: { value: 0 },
      uBurst: { value: 0 },
      uSize: { value: 0.55 * garnish.moteSize },
      uWarm: { value: 0 },
      uDivide: { value: 0 },
      uFreeze: { value: 0 },
      uWind: { value: new THREE.Vector2(visual.dust.flow[0], visual.dust.flow[1]) },
      uBurstDir: { value: new THREE.Vector2(movement.burstDir[0], movement.burstDir[1]) },
      uMoteA: { value: new THREE.Color(visual.dust.color) },
      uMoteB: { value: accentBright.clone() },
      uWarmColor: { value: dawnColor.clone() },
      uFrostColor: { value: frostColor.clone() },
      uExposure: { value: 1 }
    };
    const motes = new THREE.Points(
      moteGeometry,
      new THREE.ShaderMaterial({
        vertexShader: MOTE_VERT,
        fragmentShader: MOTE_FRAG,
        uniforms: moteUniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    motes.renderOrder = 2;
    motes.frustumCulled = false;
    scene.add(motes);
    disposables.push(moteGeometry, motes.material as THREE.Material);

    /* -------- the lens -------- */
    const lensUniforms = {
      uFlash: { value: 0 },
      uBlack: { value: 0 },
      uVign: { value: 0.75 },
      uGlow: { value: 0 },
      uStreak: { value: 0 },
      uAspect: { value: 16 / 9 },
      uGlowColor: { value: accentBright.clone().lerp(new THREE.Color("#ffffff"), 0.3) },
      uGlowCenter: { value: new THREE.Vector2(0.5, 0.55) }
    };
    const lensGeometry = new THREE.PlaneGeometry(2, 2);
    const lens = new THREE.Mesh(
      lensGeometry,
      new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERT,
        fragmentShader: LENS_FRAG,
        uniforms: lensUniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false
      })
    );
    lens.renderOrder = 10;
    lens.frustumCulled = false;
    scene.add(lens);
    disposables.push(lensGeometry, lens.material as THREE.Material);

    const resize = () => {
      const w = Math.max(mount.clientWidth, 1);
      const h = Math.max(mount.clientHeight, 1);
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloomPass.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      skyUniforms.uAspect.value = w / h;
      lensUniforms.uAspect.value = w / h;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    /* -------- the single clock -------- */
    const clock = new THREE.Clock();
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
    let timeOffset = 0;

    seekRef.current = (target: number) => {
      const clamped = Math.max(0, Math.min(reel.length - 1, target));
      timeOffset = clock.elapsedTime - starts[clamped];
      // Applied immediately: a skip is a cut, and a throttled rAF in a
      // backgrounded tab must not be able to swallow the input.
      currentBeat = clamped;
      currentSlice = -1;
      snapValues = true;
      setBeatIndex(clamped);
      setSlice(0);
    };

    // Slices follow the reading cuts, so a long line holds the frame longer
    // than a short one instead of every line getting the same flat share.
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
          // Darkness, then the worldheart kindles alone.
          T.presence = 0;
          T.kindle = Math.pow(ctx.p, 0.7) * 0.9;
          T.exposure = 0.6;
          T.gate = movement.aperture * (0.5 + 0.5 * Math.pow(ctx.p, 0.6));
          T.glow = 0.08;
          T.bloom = 0.7;
          break;
        case "loom":
          // The world stands into view around its heart.
          T.presence = Math.min(1, ctx.p * 1.5);
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
        // THE READING BEATS. The world steps aside and takes a stop of light
        // off — but only a stop. It used to give up nearly half its exposure
        // and 40% of its size on top of a scrim, which left the fate that the
        // whole finale is about as a smudge behind the credits.
        case "epilogue":
        case "chronicle":
        case "ledger":
          T.tintAmt = 0.8;
          T.veil = 0.32;
          T.aside = 1; // the world steps aside so the words own the frame
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

    /* -------- camera rig -------- */
    const pose = new THREE.Vector3(0, 0.9, 11);
    const look = new THREE.Vector3(0, 0.6, 0);
    const poseTarget = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();
    let fov = 45;

    const cameraFor = (ctx: Ctx) => {
      let fovT = 45;
      switch (ctx.id) {
        case "strike": poseTarget.set(0, 1.1, 6.2); lookTarget.set(0, 0.8, 0); break;
        case "loom": poseTarget.set(0, 1.4, 11.5); lookTarget.set(0, 0.5, 0); break;
        case "kind": poseTarget.set(0, 1.2, 11); lookTarget.set(0, 0.6, 0); break;
        case "title": poseTarget.set(0, 1.5, 10.6 - ctx.p * 0.6); lookTarget.set(0, 0.9, 0); break;
        case "epilogue":
        case "chronicle":
        case "ledger":
        case "cast":
          poseTarget.set(Math.sin(ctx.t * 0.06) * 0.4, 1.1, 11);
          lookTarget.set(0.5, 0.7, 0);
          break;
        case "fin":
        case "hold": {
          const p = ctx.settled ? 1 : ctx.p;
          switch (kind) {
            case "victory":
              // The saved world earns a slow, sunlit orbit that keeps climbing
              // — we end looking slightly DOWN on a world that survived.
              poseTarget.set(Math.sin(ctx.t * 0.05) * 1.4 * p, 1.2 + p * 2.4, 11.2 + p * 1.4);
              lookTarget.set(0, 0.5, 0);
              fovT = 45 - p * 3;
              break;
            case "defeat":
              // The camera settles just under the rim, looking slightly up at
              // what is left hanging over the hole — low enough to feel like
              // the loss, high enough that the island is still the subject.
              // The rig drops the island as the maw takes it, so the camera has
              // to go down WITH it or the subject leaves the bottom of frame.
              poseTarget.set(0, 0.4 - p * 1.0, 10.6 + p * 1.4);
              lookTarget.set(0, 0.4 - p * 1.5, 0);
              fovT = 44 + p * 3;
              break;
            case "bittersweet":
              // Dead level, dead centre, dead still: the line has to be a line.
              poseTarget.set(0, 1.0, 11.4);
              lookTarget.set(0, 0.55, 0);
              fovT = 45 - p * 2;
              break;
            case "escape":
              // Track the world as it lifts away toward the deep sky.
              poseTarget.set(Math.sin(ctx.t * 0.04) * 0.4 * p, 1.1, 11.5);
              lookTarget.set(0, 0.7 + p * 1.5, 0);
              fovT = 45 + p * 9;
              break;
            case "draw": poseTarget.set(0, 1.0, 11.6); lookTarget.set(0, 0.55, 0); break;
            case "cliffhanger":
              if (ctx.settled) { poseTarget.set(0.6, 0.9, 10.4); lookTarget.set(0.4, 0.6, 0); }
              else { poseTarget.set(0.4 + p * 1.0, 0.9, 11 - p * 2.6); lookTarget.set(0.5, 0.6 + p * 0.3, 0); }
              break;
            default: poseTarget.set(0, 1.1, 11.2); lookTarget.set(0, 0.6, 0);
          }
          break;
        }
      }
      return fovT;
    };

    /* -------- the frame -------- */
    let spinAngle = 0;
    let moteTime = 0; // the dust's own clock — the stalemate freezes it mid-air
    let skyTime = 0; //  and the weather's, for the same reason
    let siblingDrift = 0; // the neighbours' clock, frozen by the stalemate too
    let lastT = 0;
    const sunScreen = new THREE.Vector3();
    const heroColors = players.slice(0, 8).map((p) => new THREE.Color(accentColor(p.color)));
    const heartCurrent = heartBase.clone();
    const crystalEmissive = heartBase.clone();
    const keyCool = accentBright.clone();

    const renderFrame = (t: number, dt: number) => {
      const reelTime = t - timeOffset;
      let index = 0;
      for (let i = 0; i < reel.length; i += 1) {
        const start = starts[i];
        const end = i + 1 < reel.length ? starts[i + 1] : Infinity;
        if (reelTime >= start && reelTime < end) { index = i; break; }
      }
      const id = reel[index].id;
      const span = reel[index].seconds;
      const progress = span === Infinity ? 0 : Math.max(0, Math.min(1, (reelTime - starts[index]) / span));

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

      // Ease everything toward its target — or snap on a seek.
      for (const keyName of TARGET_KEYS) {
        if (snapValues) cur[keyName] = T[keyName];
        else {
          const rate = RATES[keyName] ?? DEFAULT_RATE;
          cur[keyName] += (T[keyName] - cur[keyName]) * (1 - Math.exp(-dt * rate));
        }
      }
      snapValues = false;

      // Candle/reactor gutter — irregular, never a strobe.
      let exposure = cur.exposure;
      if (garnish.gutter > 0) {
        const flick = (Math.sin(t * 11.3) * 0.5 + 0.5) * (Math.sin(t * 2.7 + 1.3) * 0.5 + 0.5);
        exposure *= 1 - garnish.gutter * 0.14 * flick;
      }

      /* ---- the world ---- */
      // The half-light stops the turn: the terminator is fixed in space, so if
      // the island kept spinning the gilded half would rotate out from under
      // its own line. It holds still and the split holds with it.
      const spinRate = 0.05 + visual.loom.motion.swirl * 0.02;
      spinAngle += dt * spinRate * (1 - cur.still) * (1 - cur.divide * 0.93) * (1 + cur.leak * 0.4);
      world.rotation.y = spinAngle;

      // Step aside for the words; recede for the leaving; tremble when struck.
      const asideX = 1.9 * cur.aside;
      const asideY = 0.42 * cur.aside;
      const shakeX = cur.shake * 0.06 * Math.sin(t * 31);
      const shakeY = cur.shake * 0.045 * Math.sin(t * 41 + 2);
      // The leaving lifts as it recedes — the world climbs away, not just back.
      world.position.set(asideX + shakeX, -0.4 + asideY + shakeY + cur.recede * 2.2, -cur.recede * 30);
      const scale = 1 - cur.aside * 0.24;
      world.scale.set(scale, scale, scale);

      matter.opacity = cur.presence * (1 - cur.veil * 0.25);
      matter.emissiveIntensity = 0.05 + cur.kindle * 0.05 + cur.dawn * 0.1 + cur.leak * 0.08;
      wireMaterial.opacity = cur.presence * 0.34 * visual.loom.wireBoost * (1 - cur.veil * 0.3) * (1 + cur.gild * 0.9 + cur.frost * 0.6);
      wireMaterial.color.copy(accent).lerp(dawnColor, cur.gild * 0.8).lerp(frostColor, cur.frost * 0.7);
      debrisMaterial.opacity = cur.presence * 0.26 * (1 - cur.veil * 0.4);
      siblingMaterial.opacity = cur.presence * (0.5 - cur.veil * 0.18) * (1 - cur.recede * 0.9);
      // The neighbours keep their own slow lives — and stop dead when the
      // stalemate stops everything. Bobbing is set from a stored base, never
      // accumulated: this frame can hold for twenty minutes.
      siblingDrift += dt * (1 - cur.still);
      for (let i = 0; i < siblings.length; i += 1) {
        siblings[i].group.rotation.y = siblings[i].spin + siblingDrift * 0.012 * (i % 2 ? 1 : -1);
        siblings[i].group.position.y = siblings[i].baseY + Math.sin(siblingDrift * 0.13 + i * 2.1) * 0.35;
      }

      // The fates grade the stone itself, not just the light on it.
      stoneUniforms.uGild.value = cur.gild;
      stoneUniforms.uDivide.value = cur.divide;
      stoneUniforms.uAsh.value = cur.ash;
      stoneUniforms.uFrost.value = cur.frost;

      // The fall: pieces calve outward, drop, and tumble into the void.
      for (const f of fated) {
        const gateSide = cur.divide > 0.05 ? (f.side < 0 ? 1 : 0) : 1; // divided: only the dark side falls
        const fall = Math.max(0, Math.min(1, (cur.ruin - f.order) * 2.6)) * gateSide;
        if (fall > 0.0001) {
          const drop = fall * fall;
          f.mesh.position.set(
            f.home.x + f.out.x * fall * 1.3,
            f.home.y - drop * 9.5,
            f.home.z + f.out.z * fall * 1.3
          );
          f.mesh.rotation.set(
            f.homeRot.x + f.tumble * fall * 2.2,
            f.homeRot.y + f.tumble * fall * 1.4,
            f.homeRot.z + f.tumble * fall * 1.8
          );
          // The void swallows what it takes — pieces shrink as they sink.
          f.mesh.scale.setScalar(Math.max(0.2, 1 - drop * 0.85));
        } else {
          const bob = f.float ? Math.sin(t * 0.9 + f.home.x * 3) * 0.12 * (1 - cur.still) : 0;
          f.mesh.position.set(f.home.x, f.home.y + bob, f.home.z);
          f.mesh.rotation.copy(f.homeRot);
          f.mesh.scale.setScalar(1);
        }
      }

      // The dawn: the key light climbs from under the horizon and floods gold.
      const dawnElev = -0.35 + cur.dawn * 1.35;
      const dawnSide = cur.divide > 0.05 ? 1 : Math.sin(t * 0.02) * 0.3; // divided: dawn locks to +x
      key.position.set(6 * (0.55 + dawnSide * 0.45), 10 * Math.sin(Math.max(dawnElev, -0.3)) + 2.5, 6);
      key.intensity = (0.5 + cur.dawn * 1.05) * (1 - cur.veil * 0.35) * exposure;
      key.color.copy(keyCool).lerp(dawnColor, cur.dawn);
      // Divided, the cold rim answers the dawn from the other side of the line.
      rim.intensity = (0.35 + cur.leak * 1.8 + cur.divide * 0.8) * (1 - cur.veil * 0.4);
      // Fill comes DOWN as the key comes up. Holding ambient at 0.8 through a
      // full dawn lit every face of the island equally and turned it into a
      // pale grey cut-out floating in gold — the silhouette needs a dark side.
      ambient.intensity = (0.8 - cur.desat * 0.2 - cur.dawn * 0.34 - cur.gild * 0.12) * exposure * (1 - cur.ruin * 0.25);
      bounce.intensity = 0.42 - cur.dawn * 0.14;
      back.intensity = 0.3 + cur.dawn * 0.35 + cur.frost * 0.4; // separates the rim from the sky

      // The worldheart: kindles at the strike, takes each hero's colour in the
      // cast, gutters (but never dies) in defeat, burns hardest at distance.
      const pulse = 0.5 + 0.5 * Math.sin(t * (cur.kindle < 0.4 ? 0.9 : 2.1));
      heartCurrent.copy(heartBase);
      if (cur.focus > 0.01 && heroColors[currentSlice]) heartCurrent.lerp(heroColors[currentSlice], cur.focus * 0.85);
      // The infection reaches the heart itself — the cliffhanger stains it.
      if (cur.leak > 0.01) heartCurrent.lerp(secondary, cur.leak * 0.55);
      heartMaterial.color.copy(heartCurrent);
      heartLight.color.copy(heartCurrent);
      const heartScale = (1.4 + pulse * 0.35) * cur.kindle * (1 + cur.recede * 0.5);
      heart.scale.set(heartScale, heartScale, 1);
      heartMaterial.opacity = Math.min(1, cur.kindle * (0.55 + pulse * 0.25));
      if (cur.leak > 0.5 && Math.sin(t * 23) < -0.72) heartMaterial.opacity *= 0.55; // it stutters
      heartLight.intensity = cur.kindle * (1.6 + pulse * 0.7);

      // The leak: wrong light through the cracks, throbbing — in three seams now.
      const leakPulse = 0.6 + 0.4 * Math.sin(t * 5.2);
      leakLight.intensity = cur.leak * 6 * leakPulse;
      beamMaterial.opacity = cur.leak * 0.85 * leakPulse;
      seamMaterials[0].opacity = cur.leak * 0.5 * (0.55 + 0.45 * Math.sin(t * 4.1 + 1.9));
      seamMaterials[1].opacity = cur.leak * 0.4 * (0.55 + 0.45 * Math.sin(t * 3.3 + 4.2));
      // The world lists: nudged by the leak, dragged right over by the ruin,
      // banking hard as it recedes — and held exactly level by the stalemate,
      // which is the whole point of that ending.
      const level = 1 - cur.frost * 0.85;
      world.rotation.z = (cur.leak * 0.06 + Math.pow(cur.ruin, 1.3) * 0.2 + cur.recede * 0.3) * level;
      world.rotation.x = (Math.pow(cur.ruin, 1.4) * 0.11 - cur.recede * 0.06) * level;

      // The cracks: ember fissures for the fall, wrong-coloured seams for the crack.
      const crackDrive = kind === "cliffhanger" ? cur.leak : Math.min(1, cur.ruin * 1.35);
      crackMaterial.opacity = crackDrive * (0.4 + 0.45 * leakPulse) * cur.presence;

      // The dawn made literal: the sun climbs, its rays fan, its halo breathes.
      // Divided, it hauls itself over to the half of the world it is allowed
      // to save and rises there.
      sunGroup.position.y = -4.4 + cur.dawn * 9.8;
      sunGroup.position.x = 4.6 + cur.divide * 2.4;
      sunHaloMaterial.opacity = cur.dawn * 0.4 * (1 - cur.veil * 0.4);
      sunCoreMaterial.opacity = Math.pow(cur.dawn, 1.5) * 0.7 * (1 - cur.veil * 0.25);
      const haloScale = 13 + Math.sin(t * 0.7) * 0.7 + cur.dawn * 6;
      sunHalo.scale.set(haloScale, haloScale, 1);
      const coreScale = 3.2 + cur.dawn * 2.2;
      sunCore.scale.set(coreScale, coreScale, 1);
      for (let i = 0; i < rayMaterials.length; i += 1) {
        rayMaterials[i].rotation = rayBase[i] + Math.sin(t * 0.12 + i * 1.7) * 0.05;
        rayMaterials[i].opacity = Math.pow(cur.dawn, 1.7) * (0.09 + (i % 3) * 0.03) * (1 - cur.veil * 0.5);
      }

      // The roots: heart-lit crystals under the crag; the void glows in answer.
      crystalMaterial.opacity = cur.presence * (1 - cur.veil * 0.35);
      // Kept under 1: past that these read as white squares under the crag
      // rather than as crystals lit by the heart above them.
      crystalMaterial.emissiveIntensity = 0.2 + cur.kindle * 0.5 + cur.leak * 0.45;
      crystalEmissive.copy(heartBase).lerp(secondary, cur.leak * 0.8);
      crystalMaterial.emissive.copy(crystalEmissive);
      voidMaterial.opacity = (0.1 + cur.kindle * 0.14 + cur.leak * 0.34) * cur.presence * (1 - cur.recede);
      voidMaterial.color.copy(heartBase).lerp(secondary, cur.leak * 0.85);
      for (const fallMaterial of fallMaterials) {
        fallMaterial.opacity = (0.1 + cur.dawn * 0.2 + cur.kindle * 0.07) * cur.presence * (1 - cur.veil * 0.45) * (1 - cur.ruin);
        fallMaterial.color.copy(accentBright).lerp(dawnColor, cur.gild * 0.8).lerp(frostColor, cur.frost * 0.7);
      }

      // The balance: two opposed pillars brighten as the world stops.
      const balance = Math.max(0, (cur.still - 0.4) / 0.6);
      for (let i = 0; i < pillarMaterials.length; i += 1) {
        pillarMaterials[i].opacity = balance * 0.5 * (1 - cur.veil * 0.5);
        pillarLights[i].intensity = balance * 2.4;
      }

      // The leaving: the world drags a smear of light behind it.
      tailMaterial.opacity = Math.pow(cur.recede, 1.25) * 0.5;
      tail.scale.set(1 + cur.recede * 16, 0.8 + cur.recede * 0.5, 1);

      // Debris: orbits, freezes for the stalemate, falls with the ruin.
      for (let i = 0; i < debris.length; i += 1) {
        const d = debris[i];
        const runaway = kind === "cliffhanger" && i === 0 ? 1 + cur.leak * 3 : 1;
        d.angle += dt * d.speed * (1 - cur.still) * runaway;
        const sink = cur.ruin * 6 * ((i % 4) / 4);
        d.line.position.set(
          Math.cos(d.angle + d.seed) * d.radius,
          d.y + Math.sin(t * 0.5 + d.seed) * 0.3 * (1 - cur.still) - sink,
          Math.sin(d.angle + d.seed) * d.radius
        );
        d.line.rotation.set(d.angle * 0.7, d.angle, d.seed);
      }

      /* ---- sky, cloud sea, motes, lens, gate ---- */
      // The sky runs on the frozen-able clock too — when the stalemate stops
      // the world, the weather stops with it. Only the film grain keeps going.
      skyTime += dt * (1 - cur.still);
      const ember = kind === "defeat" ? cur.ruin : kind === "bittersweet" ? cur.ruin * 0.55 : 0;
      skyUniforms.uTime.value = skyTime;
      skyUniforms.uRaw.value = t;
      skyUniforms.uExposure.value = exposure;
      skyUniforms.uDesat.value = Math.max(garnish.mono, cur.desat);
      skyUniforms.uTintAmt.value = cur.tintAmt;
      skyUniforms.uDawn.value = cur.dawn;
      skyUniforms.uDivide.value = cur.divide;
      skyUniforms.uEmber.value = ember;
      skyUniforms.uWarp.value = Math.pow(cur.recede, 1.2);
      skyUniforms.uLeakSky.value = cur.leak * (0.6 + 0.4 * leakPulse);
      skyUniforms.uFrost.value = cur.frost;
      skyUniforms.uStars.value = garnish.stars * (1 + cur.recede * 1.6); // the deep sky opens
      // The sky's corona has to sit exactly where the sun sprite is, so it is
      // projected, not guessed — the camera moves under all six fates.
      sunScreen.copy(sunGroup.position).project(camera);
      skyUniforms.uSunPos.value.set(sunScreen.x * 0.5 + 0.5, sunScreen.y * 0.5 + 0.5);
      (scene.fog as THREE.FogExp2).density = visual.fogDensity * 0.4 * (1 - cur.recede);

      cloudUniforms.uTime.value = skyTime;
      cloudUniforms.uOpacity.value = cur.presence * (0.85 - cur.veil * 0.3) * (1 - cur.recede);
      cloudUniforms.uDawn.value = cur.dawn;
      cloudUniforms.uEmber.value = ember;
      cloudUniforms.uLeak.value = cur.leak;
      cloudUniforms.uFrost.value = cur.frost;
      cloudUniforms.uDivide.value = cur.divide;

      // The dust runs on its own clock so the stalemate can freeze it mid-air.
      moteTime += dt * (1 - cur.still);
      moteUniforms.uTime.value = moteTime;
      moteUniforms.uBurst.value = cur.burst;
      moteUniforms.uWarm.value = cur.dawn;
      moteUniforms.uDivide.value = cur.divide;
      moteUniforms.uFreeze.value = cur.frost;
      moteUniforms.uExposure.value = exposure;

      lensUniforms.uFlash.value = cur.flash;
      lensUniforms.uBlack.value = cur.black;
      lensUniforms.uGlow.value = cur.glow;
      lensUniforms.uStreak.value = cur.flash * 0.8;
      if (kind === "cliffhanger" && (id === "fin" || id === "hold")) lensUniforms.uGlowCenter.value.set(0.6, 0.42);
      else lensUniforms.uGlowCenter.value.set(0.5, 0.55);

      root.style.setProperty("--gate", String(cur.gate));
      root.style.setProperty("--jitter", String(Math.round(cur.jitter * 10) / 10));

      /* ---- camera ---- */
      const fovT = cameraFor(ctx);
      const still = kind === "draw" && id === "hold" ? 0 : 1;
      const ease = 1 - Math.exp(-dt * 2.2);
      pose.lerp(poseTarget, ease);
      look.lerp(lookTarget, ease);
      camera.position.set(
        pose.x + Math.sin(t * 0.11) * 0.05 * still,
        pose.y + Math.cos(t * 0.09 + 2) * 0.04 * still,
        pose.z
      );
      camera.lookAt(look);
      if (Math.abs(fovT - fov) > 0.01) {
        fov += (fovT - fov) * ease;
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      camera.updateMatrixWorld();

      // The rigs run LAST, on a fully posed world and a settled camera: the
      // fall shoves the island down its hole, the crack glitches landmarks out
      // of place, and the flare chain needs the sun's final screen position.
      for (const rig of rigs) rig(t, dt, ctx, cur);

      bloomPass.strength = cur.bloom * BLOOM_BASE * (1 - cur.veil * 0.25);
      composer.render(dt);
      lastT = t;
      void lastT;
    };

    if (reducedMotion) {
      // One authored still — the settled hold frame — plus timer-driven cards.
      const ctx: Ctx = { id: "hold", p: 1, hump: 0, settled: true, through: 1, t: 10 };
      spine(ctx);
      movement.script(ctx, T);
      for (const keyName of TARGET_KEYS) cur[keyName] = T[keyName];
      root.style.setProperty("--gate", String(cur.gate));
      renderFrame(10, 10);
      const timers: Array<ReturnType<typeof setTimeout>> = [];
      let at = 0;
      for (let i = 0; i < reel.length; i += 1) {
        const target = i;
        timers.push(setTimeout(() => setBeatIndex(target), at * 1000));
        at += reel[i].seconds === Infinity ? 0 : reel[i].seconds;
      }
      // A manual seek (advance, rewind, skip) takes the reel over from the
      // timers and paints the sought beat's still immediately.
      const playSeek = seekRef.current;
      seekRef.current = (target: number) => {
        for (const timer of timers) clearTimeout(timer);
        timers.length = 0;
        playSeek?.(target);
        renderFrame(0.05, 0.016);
      };
      return () => {
        for (const timer of timers) clearTimeout(timer);
        observer.disconnect();
        seekRef.current = null;
        for (const item of disposables) item.dispose();
        composer.dispose();
        renderer.dispose();
        if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      };
    }

    let last = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      const dt = Math.min(Math.max(t - last, 0.001), 0.1);
      last = t;
      renderFrame(t, dt);
    };
    // Paint frame zero synchronously: the mount must never show a blank canvas
    // while the first rAF is pending, and shaders compile before the reel rolls.
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
      for (const item of disposables) item.dispose();
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
