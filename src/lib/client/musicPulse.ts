"use client";

import { bgmGetAnalyser } from "@/lib/client/audio";

/* ═══════════════════════════════════════════════════════════════════════════
   MUSIC PULSE — one clean, instrument-aware read of the score.

   Every 3D scene used to roll its own analyser math inline, and it all hung
   off ONE signal: "is the bass louder than its own average". That detector
   fired on pads and swells as readily as on drums, needed a fake metronome to
   cover the gaps, and gave the whole scene a single undifferentiated throb.

   This module replaces that with proper per-band SPECTRAL FLUX onset
   detection, so the scene can tell instruments apart and answer each one
   differently:

     kick   — flux in 45-130 Hz. The floor. Wide, slow ground shockwaves.
     snare  — flux in 340-3600 Hz. The hit. Tight, fast, bright flashes.
     hat    — flux in 3600-15000 Hz. The shimmer. Sparkle and spin.
     swell  — sustained crescendo (fast loudness envelope pulling away from a
              slow one). Strings/pads/choir: a bloom, never a hit.

   Why flux and not level: a level threshold ("louder than average") measures
   how LOUD the music is, an onset measures how suddenly its spectrum CHANGED.
   Summing only the positive dB deltas per bin means a sustained loud pad
   contributes nothing at all after its attack, while a quiet kick under a
   loud pad still reads — which is exactly the difference between a detector
   that "feels like the music" and one that strobes at random.

   Each channel carries its own adaptive threshold (running mean + running
   deviation of its own flux), a level gate so silence can never trip it, and
   a refractory window so one hit is one event rather than a burst of three.
   Kick intervals are collected into a median tempo estimate, which is what
   `beatAge` normalizes against: a shockwave paced to the actual song rather
   than to a hardcoded constant.

   With no analyser yet (or a silent one) `read` returns a gentle synthetic
   breath with `playing: false`, so scenes still move before music starts.
   Nothing here allocates per frame — the same object is returned each read.
   ═══════════════════════════════════════════════════════════════════════ */

export type PulseInstrument = "kick" | "snare" | "hat" | "none";

export type MusicPulse = {
  /** True when a real analyser is delivering audible signal. */
  playing: boolean;
  /** Overall smoothed loudness, 0..1-ish (comparable to the old musicLevel). */
  level: number;
  sub: number;
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  treble: number;
  air: number;
  /** Spectral centroid, 0 (dark pads) .. 1 (bright shimmer). */
  brightness: number;
  /** Instant-attack, fast-decay envelopes per instrument, 0..1. */
  kick: number;
  snare: number;
  hat: number;
  /** Slow crescendo bloom, 0..1 — strings and choirs, not drums. */
  swell: number;
  /** True only on the frame the onset was detected. */
  kickHit: boolean;
  snareHit: boolean;
  hatHit: boolean;
  /** Time since the last kick, normalized by the tempo estimate (0..1.4). */
  beatAge: number;
  /** Time since the last snare, normalized to a short window (0..1.4). */
  snareAge: number;
  /** Median kick interval in seconds; 0 until enough beats are seen. */
  beatPeriod: number;
  /** Which instrument fired most recently. */
  last: PulseInstrument;
};

type BandKey = "sub" | "bass" | "lowMid" | "mid" | "highMid" | "treble" | "air";

/** Band edges in Hz — resolved to bin ranges once the analyser is known. */
const BANDS: Array<{ key: BandKey; lo: number; hi: number; smooth: number }> = [
  { key: "sub", lo: 20, hi: 60, smooth: 9 },
  { key: "bass", lo: 45, hi: 130, smooth: 9 },
  { key: "lowMid", lo: 130, hi: 340, smooth: 8 },
  { key: "mid", lo: 340, hi: 1300, smooth: 7 },
  { key: "highMid", lo: 1300, hi: 3600, smooth: 7 },
  { key: "treble", lo: 3600, hi: 8500, smooth: 8 },
  { key: "air", lo: 8500, hi: 15000, smooth: 8 }
];

/** dB → 0..1, matching the old Uint8 mapping so existing visual gains hold. */
const DB_MIN = -100;
const DB_SPAN = 70;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

type Channel = {
  /** Running mean and deviation of this channel's own flux. */
  mean: number;
  dev: number;
  cool: number;
  env: number;
  last: number;
  /** Detector tuning. */
  k: number;
  floor: number;
  gate: number;
  refractory: number;
  decay: number;
};

const channel = (k: number, floor: number, gate: number, refractory: number, decay: number): Channel => ({
  mean: 0,
  dev: 0,
  cool: 0,
  env: 0,
  last: -10,
  k,
  floor,
  gate,
  refractory,
  decay
});

export type MusicPulseReader = {
  /** Call once per frame. `dt` in seconds, `now` a monotonic clock in seconds. */
  read: (dt: number, now: number) => MusicPulse;
};

export function createMusicPulse(): MusicPulseReader {
  const out: MusicPulse = {
    playing: false,
    level: 0,
    sub: 0,
    bass: 0,
    lowMid: 0,
    mid: 0,
    highMid: 0,
    treble: 0,
    air: 0,
    brightness: 0.35,
    kick: 0,
    snare: 0,
    hat: 0,
    swell: 0,
    kickHit: false,
    snareHit: false,
    hatHit: false,
    beatAge: 1,
    snareAge: 1,
    beatPeriod: 0,
    last: "none"
  };

  // Explicitly ArrayBuffer-backed: getFloatFrequencyData rejects a possibly
  // SharedArrayBuffer-backed view under the DOM lib's stricter typings.
  let spectrum: Float32Array<ArrayBuffer> | null = null;
  let previous: Float32Array<ArrayBuffer> | null = null;
  let ranges: Array<{ key: BandKey; a: number; b: number; smooth: number }> = [];
  let resolvedBins = 0;
  let resolvedRate = 0;

  // Flux windows: kick is the bass band, snare spans mid + high-mid (a snare's
  // body and its crack), hat is treble + air.
  let kickWindow = { a: 0, b: 1 };
  let snareWindow = { a: 0, b: 1 };
  let hatWindow = { a: 0, b: 1 };

  const kickCh = channel(1.55, 0.024, 0.17, 0.15, 3.6);
  const snareCh = channel(1.75, 0.022, 0.11, 0.12, 4.4);
  const hatCh = channel(2.0, 0.02, 0.07, 0.07, 6.2);

  const intervals: number[] = [];
  let fastLevel = 0;
  let slowLevel = 0;
  let silentFor = 0;

  const resolve = (bins: number, sampleRate: number) => {
    resolvedBins = bins;
    resolvedRate = sampleRate;
    const nyquist = sampleRate / 2;
    const binOf = (hz: number) => Math.max(0, Math.min(bins - 1, Math.round((hz / nyquist) * bins)));
    ranges = BANDS.map(({ key, lo, hi, smooth }) => {
      const a = binOf(lo);
      return { key, a, b: Math.max(a + 1, binOf(hi)), smooth };
    });
    const byKey = (key: BandKey) => ranges.find((r) => r.key === key)!;
    kickWindow = { a: byKey("bass").a, b: byKey("bass").b };
    snareWindow = { a: byKey("mid").a, b: byKey("highMid").b };
    hatWindow = { a: byKey("treble").a, b: byKey("air").b };
    spectrum = new Float32Array(new ArrayBuffer(bins * 4)).fill(DB_MIN);
    previous = new Float32Array(new ArrayBuffer(bins * 4)).fill(DB_MIN);
  };

  /** Positive-only dB flux across a bin window, normalized so ~4 dB/bin = 1. */
  const flux = (window: { a: number; b: number }) => {
    if (!spectrum || !previous) return 0;
    let sum = 0;
    for (let i = window.a; i < window.b; i += 1) {
      const d = spectrum[i] - previous[i];
      if (d > 0) sum += d;
    }
    return clamp01(sum / Math.max(1, (window.b - window.a) * 4));
  };

  /**
   * Adaptive onset gate: fire when this channel's flux breaks out of its own
   * recent statistics AND the band is actually audible. The mean/deviation
   * tracking is what makes it work equally on a sparse ambient bed and a wall
   * of distorted guitar — the bar is always relative to the current material.
   */
  const detect = (ch: Channel, value: number, band: number, dt: number, now: number) => {
    ch.cool -= dt;
    const follow = Math.min(1, dt * 3.2);
    const threshold = ch.mean + ch.dev * ch.k + ch.floor;
    let hit = false;
    if (ch.cool <= 0 && band > ch.gate && value > threshold) {
      hit = true;
      if (ch.last > -1) {
        const gap = now - ch.last;
        if (gap > 0.26 && gap < 1.45) {
          intervals.push(gap);
          if (intervals.length > 9) intervals.shift();
        }
      }
      ch.last = now;
      ch.cool = ch.refractory;
      ch.env = 1;
    }
    ch.mean += (value - ch.mean) * follow;
    ch.dev += (Math.abs(value - ch.mean) - ch.dev) * follow;
    if (!hit) ch.env = Math.max(0, ch.env - dt * ch.decay);
    return hit;
  };

  const median = (values: number[]) => {
    if (values.length < 3) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  const read = (dt: number, now: number): MusicPulse => {
    const step = Math.max(0.001, Math.min(0.1, dt));
    const analyser = bgmGetAnalyser();
    out.kickHit = false;
    out.snareHit = false;
    out.hatHit = false;

    if (analyser) {
      const bins = analyser.frequencyBinCount;
      const rate = analyser.context.sampleRate;
      if (bins !== resolvedBins || rate !== resolvedRate || !spectrum) resolve(bins, rate);
      const data = spectrum!;
      const prev = previous!;
      // Keep the previous frame for the flux difference before overwriting.
      prev.set(data);
      analyser.getFloatFrequencyData(data);

      let weighted = 0;
      let total = 0;
      for (const range of ranges) {
        let sum = 0;
        for (let i = range.a; i < range.b; i += 1) {
          const db = data[i];
          const v = clamp01(((db < DB_MIN ? DB_MIN : db) - DB_MIN) / DB_SPAN);
          sum += v;
          weighted += v * i;
          total += v;
        }
        const value = sum / (range.b - range.a);
        out[range.key] += (value - out[range.key]) * Math.min(1, step * range.smooth);
      }
      const loud = (out.bass + out.lowMid + out.mid) / 3;
      out.level += (loud - out.level) * Math.min(1, step * 8);
      const centroid = total > 0.0001 ? weighted / total / Math.max(1, bins) : 0.3;
      out.brightness += (clamp01(centroid * 3.4) - out.brightness) * Math.min(1, step * 4);

      if (out.level < 0.02) silentFor += step;
      else silentFor = 0;
      out.playing = silentFor < 0.5;

      if (out.playing) {
        out.kickHit = detect(kickCh, flux(kickWindow), out.bass, step, now);
        out.snareHit = detect(snareCh, flux(snareWindow), (out.mid + out.highMid) * 0.5, step, now);
        out.hatHit = detect(hatCh, flux(hatWindow), (out.treble + out.air) * 0.5, step, now);
      } else {
        kickCh.env = Math.max(0, kickCh.env - step * kickCh.decay);
        snareCh.env = Math.max(0, snareCh.env - step * snareCh.decay);
        hatCh.env = Math.max(0, hatCh.env - step * hatCh.decay);
      }
    } else {
      // No graph yet: a slow synthetic breath so scenes are never inert, with
      // a soft "kick" every couple of seconds to keep the ground alive.
      out.playing = false;
      const breathe = (target: number, key: "level" | BandKey, rate = 2) => {
        out[key] += (target - out[key]) * Math.min(1, step * rate);
      };
      breathe(0.2 + Math.sin(now * 0.9) * 0.07, "level");
      breathe(0.18 + Math.sin(now * 0.8) * 0.06, "bass");
      breathe(0.14 + Math.sin(now * 0.63 + 1.2) * 0.05, "mid");
      breathe(0.1 + Math.sin(now * 1.1 + 2.4) * 0.04, "treble");
      breathe(0.07 + Math.sin(now * 1.3 + 0.6) * 0.03, "air");
      out.brightness += (0.35 - out.brightness) * Math.min(1, step * 2);
      if (now - kickCh.last > 2.1) {
        kickCh.last = now;
        kickCh.env = 0.55;
        out.kickHit = true;
      }
      kickCh.env = Math.max(0, kickCh.env - step * 2.4);
      snareCh.env = Math.max(0, snareCh.env - step * 3);
      hatCh.env = Math.max(0, hatCh.env - step * 4);
      intervals.length = 0;
    }

    out.kick = kickCh.env;
    out.snare = snareCh.env;
    out.hat = hatCh.env;

    // Crescendo: the fast loudness envelope pulling away from the slow one.
    // Drums barely move it (they're gone before the slow envelope notices);
    // a rising string bed pushes it steadily up.
    fastLevel += (out.level - fastLevel) * Math.min(1, step * 1.8);
    slowLevel += (out.level - slowLevel) * Math.min(1, step * 0.22);
    out.swell = clamp01((fastLevel - slowLevel) * 3.4);

    out.beatPeriod = median(intervals);
    const beatSpan = out.beatPeriod > 0 ? out.beatPeriod : 0.85;
    out.beatAge = Math.min(1.4, (now - kickCh.last) / beatSpan);
    out.snareAge = Math.min(1.4, (now - snareCh.last) / 0.42);
    if (out.kickHit) out.last = "kick";
    else if (out.snareHit) out.last = "snare";
    else if (out.hatHit) out.last = "hat";

    return out;
  };

  return { read };
}
