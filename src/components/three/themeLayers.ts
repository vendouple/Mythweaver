"use client";

import type { ThemeVisual } from "./themeVisuals";

/**
 * Irregular light-gutter for a theme — horror candles, wasteland reactors,
 * noir neon buzz. Returns a multiplier around 1 that occasionally dips; a
 * theme with no flicker personality returns exactly 1. Drive lamps, god rays,
 * and ring glows with it so a horror stage breathes like candlelight while a
 * fantasy one holds steady. (The genre environments themselves live in
 * themeEnvironments.ts.)
 */
export function themeGutter(visual: ThemeVisual, t: number): number {
  const flicker = visual.loom.motion.flicker;
  if (!flicker) return 1;
  // Three incommensurate waves beat irregularly; only their coincident peaks
  // cross the threshold, so dips arrive like a draft catching the flame.
  const wave = Math.sin(t * 6.7) * Math.sin(t * 2.9 + 1.4) * (0.6 + 0.4 * Math.sin(t * 0.53));
  const threshold = 1 - flicker * 0.55;
  const dip = Math.max(0, wave - threshold) / Math.max(0.001, 1 - threshold);
  return 1 - Math.min(1, dip) * flicker * 0.6;
}
