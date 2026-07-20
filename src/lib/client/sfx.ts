"use client";

import { loadSfxManifest } from "@/lib/client/audio";
import type { SfxCue } from "@/lib/campaign/types";

/**
 * Table foley. Every cue has a hand-rolled WebAudio synth fallback so the
 * game sounds alive with zero assets; drop a matching file into
 * public/music/SFX/ (e.g. "join.mp3", "beat.mp3") and it is used instead.
 */

export type SfxName = SfxCue
  | "tap"        // small UI touch (action card, tab)
  | "confirm"    // begin / summon buttons
  | "send"       // free-form action dispatched to the Weaver
  | "join";      // a hero takes a seat in the lobby

let sfxMuted = false;
let fileMap: Record<string, string> | null = null;
let manifestPromise: Promise<void> | null = null;
let ctx: AudioContext | null = null;

const SFX_VOLUME_KEY = "mythweaver-sfx-volume";

/** User SFX volume 0..1, restored from a previous session. */
let sfxVolume = 1;
if (typeof window !== "undefined") {
  const raw = window.localStorage.getItem(SFX_VOLUME_KEY);
  const parsed = raw == null ? NaN : parseFloat(raw);
  if (Number.isFinite(parsed)) sfxVolume = Math.min(1, Math.max(0, parsed));
}

export function sfxSetMuted(muted: boolean) {
  sfxMuted = muted;
}

/** Set the user SFX volume (0..1). Persists across sessions. */
export function sfxSetVolume(next: number) {
  sfxVolume = Math.min(1, Math.max(0, next));
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SFX_VOLUME_KEY, String(sfxVolume));
  }
}

export function sfxGetVolume() {
  return sfxVolume;
}

function ensureManifest() {
  if (manifestPromise) return manifestPromise;
  manifestPromise = loadSfxManifest()
    .then((files) => {
      fileMap = {};
      for (const url of files) {
        const base = url.split("/").pop() || "";
        const name = base.replace(/\.[a-z0-9]+$/i, "").toLowerCase();
        fileMap[name] = url;
      }
    })
    .catch(() => {
      fileMap = {};
    });
  return manifestPromise;
}

function audioContext(): AudioContext | null {
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

function makeNoise(context: AudioContext, seconds: number) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  return source;
}

function tone(
  context: AudioContext,
  master: GainNode,
  opts: { type?: OscillatorType; from: number; to?: number; at?: number; dur: number; peak: number }
) {
  const start = context.currentTime + (opts.at ?? 0);
  const osc = context.createOscillator();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.from, start);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(opts.to, 1), start + opts.dur);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(opts.peak, start + Math.min(0.03, opts.dur / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + opts.dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(start);
  osc.stop(start + opts.dur + 0.05);
}

const SYNTHS: Partial<Record<SfxName, (context: AudioContext, master: GainNode) => void>> = {
  tap(context, master) {
    tone(context, master, { type: "sine", from: 540, to: 340, dur: 0.09, peak: 0.5 });
  },
  confirm(context, master) {
    tone(context, master, { type: "triangle", from: 523, dur: 0.16, peak: 0.45 });
    tone(context, master, { type: "triangle", from: 784, at: 0.09, dur: 0.28, peak: 0.4 });
  },
  send(context, master) {
    const noise = makeNoise(context, 0.35);
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(400, context.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2400, context.currentTime + 0.3);
    filter.Q.value = 2.5;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, context.currentTime + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.34);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    noise.start();
    tone(context, master, { type: "sine", from: 660, to: 990, dur: 0.22, peak: 0.18 });
  },
  join(context, master) {
    [523.25, 659.25, 783.99].forEach((freq, index) => {
      tone(context, master, { type: "triangle", from: freq, at: index * 0.11, dur: 0.9 - index * 0.15, peak: 0.32 / (index * 0.4 + 1) });
    });
  },
  beat(context, master) {
    // A soft page-turn: a whisper of filtered noise, barely there.
    const noise = makeNoise(context, 0.28);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2600, context.currentTime);
    filter.frequency.exponentialRampToValueAtTime(500, context.currentTime + 0.26);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.1, context.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.27);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    noise.start();
  },
  flash(context, master) {
    const noise = makeNoise(context, 0.5);
    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1400;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.5, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.5);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    noise.start();
    tone(context, master, { type: "sine", from: 1320, to: 440, dur: 0.5, peak: 0.25 });
  },
  rumble(context, master) {
    const noise = makeNoise(context, 0.9);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 140;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.8, context.currentTime + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.9);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    noise.start();
    tone(context, master, { type: "sine", from: 60, to: 32, dur: 0.9, peak: 0.6 });
  },
  darkness(context, master) {
    tone(context, master, { type: "sine", from: 220, to: 48, dur: 1.6, peak: 0.35 });
    tone(context, master, { type: "sine", from: 226, to: 52, at: 0.05, dur: 1.6, peak: 0.2 });
  },
  heartbeat(context, master) {
    for (let i = 0; i < 2; i += 1) {
      tone(context, master, { type: "sine", from: 58, to: 40, at: i * 0.32, dur: 0.22, peak: 0.7 });
    }
  }
};

/** Fire a cue. Silently does nothing if audio is unavailable or muted. */
export function playSfx(name: SfxName, volume = 1) {
  if (sfxMuted || sfxVolume <= 0) return;
  if (!fileMap) {
    ensureManifest().then(() => playSfx(name, volume));
    return;
  }
  try {
    const fileUrl = fileMap?.[name];
    if (fileUrl) {
      const el = new Audio(fileUrl);
      el.volume = Math.min(1, 0.55 * volume * sfxVolume);
      el.play().catch(() => undefined);
      return;
    }
    const synth = SYNTHS[name];
    if (!synth) return;
    const context = audioContext();
    if (!context) return;
    const master = context.createGain();
    master.gain.value = 0.16 * volume * sfxVolume;
    master.connect(context.destination);
    synth(context, master);
  } catch {
    // Foley is decoration; never let it break the game.
  }
}
