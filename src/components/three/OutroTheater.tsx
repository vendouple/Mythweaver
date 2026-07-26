"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { CampaignEnding, EndingCastMember, EndingKind, EndingStat, Player } from "@/lib/campaign/types";
import { accentColor } from "@/lib/client/api";
import { themeVisual, ThemeKey } from "@/components/three/themeVisuals";

/**
 * THE LAST REEL
 * =============
 * The saga doesn't end with a web page scrolling under some particles. It ends
 * the way a film ends: a projector strikes, the campaign's own painted scenes
 * are held full-frame with nothing written on them, and the words arrive one
 * card at a time in a fixed band at the bottom of the gate.
 *
 * Three rules hold the whole thing together, and breaking any of them is how
 * this drifts back into looking like a settings screen:
 *
 *  1. ONE text block on screen at a time, in ONE fixed slot. Nothing scrolls,
 *     nothing reflows, nothing accumulates. A twelve-word AI title and six
 *     highlights and five heroes all have to survive, and they do because the
 *     slot never changes size — the content is time-sliced into it.
 *  2. TWO VERBS: fade and cut. That's all a projector has. No blur-in, no
 *     slide-up, no frosted cards, no rounded corners, no glow on type. The old
 *     finale's `filter: blur(7px)` reveal was its loudest tell at couch
 *     distance.
 *  3. ONE CLOCK. The render loop owns the beat index and the DOM owns no
 *     timing at all. That's what makes "skip" a seek instead of a remount, and
 *     it's why the words stay welded to the picture.
 *
 * Total runtime is content-independent (~46s) and then it holds indefinitely
 * on a cheap idle frame, because this screen sits on a living-room TV for
 * twenty minutes while people talk about what just happened.
 */

/* ------------------------------------------------------------------ */
/* The reel                                                            */
/* ------------------------------------------------------------------ */

type BeatId =
  | "strike"
  | "plate"
  | "kind"
  | "title"
  | "epilogue"
  | "chronicle"
  | "ledger"
  | "cast"
  | "fin"
  | "hold";

type Beat = { id: BeatId; seconds: number };

/**
 * Fixed-length beats. Variable content (highlights, heroes) is SLICED across
 * its beat rather than extending it, so five heroes and one hero produce the
 * same 46 seconds. The old finale accumulated per-item animation delays, which
 * is why a full party pushed FIN out past the point where the 3D had already
 * become wallpaper.
 */
const REEL: Beat[] = [
  { id: "strike", seconds: 2.2 },
  { id: "plate", seconds: 5.0 },
  { id: "kind", seconds: 2.6 },
  { id: "title", seconds: 5.4 },
  { id: "epilogue", seconds: 6.2 },
  { id: "chronicle", seconds: 6.6 },
  { id: "ledger", seconds: 4.4 },
  { id: "cast", seconds: 12.0 },
  { id: "fin", seconds: 4.2 },
  { id: "hold", seconds: Infinity }
];

/** How the frame dies. Frame-scale events — the whole picture, not a particle. */
type Terminal = "whiteout" | "closing" | "punch" | "halt" | "even" | "fade";

/**
 * Per-kind divergence lives in the EDIT, not just the palette. A defeat has its
 * dissolves surgically removed so every transition is a hard cut; a stalemate
 * runs metronomic so the even spacing is the argument; a cliffhanger stalls and
 * runs out of the gate mid-sentence.
 */
type Edit = {
  label: string;
  fin: string;
  /** Cross-dissolve length in seconds. 0 = hard cuts only. */
  dissolve: number;
  /** Master pace multiplier on every beat. */
  pace: number;
  /** When set, every beat is forced to exactly this length (draw's metronome). */
  metronome?: number;
  terminal: Terminal;
  /** Duotone grade poles applied to the campaign's own scenes. */
  grade: { shadow: string; mid: string; high: string };
  /** How much of the original scene colour bleeds back through the grade. */
  bleed: number;
  /** Projector exposure: >1 blows the highlights, <1 lets the frame go dim. */
  exposure: number;
  /** Gate weave amplitude — how much the frame breathes in its gate. */
  weave: number;
  /** Dust density in the beam, 0..1. */
  dust: number;
  /** Aperture height as a fraction of the frame (2.39:1 ≈ 0.42 of 16:9). */
  aperture: number;
};

const EDITS: Record<EndingKind | "generic", Edit> = {
  victory: {
    label: "Victory",
    fin: "FIN",
    dissolve: 0.9,
    pace: 1,
    terminal: "whiteout",
    grade: { shadow: "#150c04", mid: "#a8752c", high: "#fff0c4" },
    bleed: 0.3,
    exposure: 1.18,
    weave: 1,
    dust: 0.85,
    aperture: 0.44
  },
  defeat: {
    label: "Defeat",
    fin: "FIN",
    // Every transition is a hard cut. Nothing is allowed to ease.
    dissolve: 0,
    pace: 1.06,
    terminal: "closing",
    grade: { shadow: "#05060a", mid: "#3d4653", high: "#c8b9a8" },
    bleed: 0.12,
    exposure: 0.82,
    weave: 0.6,
    dust: 0.5,
    aperture: 0.4
  },
  bittersweet: {
    label: "Bittersweet",
    fin: "FIN",
    dissolve: 1.5,
    pace: 1.08,
    terminal: "fade",
    grade: { shadow: "#0a0a12", mid: "#7b6a86", high: "#ffe0b0" },
    bleed: 0.34,
    exposure: 1,
    weave: 0.9,
    dust: 0.75,
    aperture: 0.43
  },
  escape: {
    label: "Escape",
    fin: "FIN",
    dissolve: 0.35,
    pace: 0.86,
    terminal: "punch",
    grade: { shadow: "#04090f", mid: "#2f6d86", high: "#e8fbff" },
    bleed: 0.28,
    exposure: 1.1,
    weave: 1.5,
    dust: 0.6,
    aperture: 0.41
  },
  draw: {
    label: "Stalemate",
    fin: "THE SCALES REST EVEN",
    dissolve: 0.7,
    pace: 1,
    // The metronome IS the point: every card holds for exactly as long as
    // every other card, and neither side gets the last word.
    metronome: 3.6,
    terminal: "even",
    grade: { shadow: "#08090d", mid: "#5c6068", high: "#e2e6ee" },
    bleed: 0.16,
    exposure: 0.95,
    weave: 0.7,
    dust: 0.55,
    aperture: 0.42
  },
  cliffhanger: {
    label: "To Be Continued",
    fin: "TO BE CONTINUED",
    dissolve: 0.5,
    pace: 0.95,
    terminal: "halt",
    grade: { shadow: "#0a0512", mid: "#6b3f8c", high: "#ffd0ec" },
    bleed: 0.36,
    exposure: 1.06,
    weave: 1.8,
    dust: 0.7,
    aperture: 0.42
  },
  generic: {
    label: "The Tale Ends",
    fin: "FIN",
    dissolve: 0.9,
    pace: 1,
    terminal: "fade",
    grade: { shadow: "#0a0b10", mid: "#5f6478", high: "#efe6cf" },
    bleed: 0.28,
    exposure: 1,
    weave: 0.9,
    dust: 0.7,
    aperture: 0.42
  }
};

/* ------------------------------------------------------------------ */
/* The gate — plate shader                                             */
/* ------------------------------------------------------------------ */

const PLATE_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * One quad carries the whole picture: two campaign scenes cross-dissolving,
 * pushed through a luminance duotone so four AI-painted images in four
 * different styles read as one authored object, then vignetted, exposed and
 * grained like film through a gate.
 *
 * The duotone is the important part and it is six lines: it's a rescue
 * mechanism for inconsistent generated art, not a stylistic flourish. It also
 * doubles as the entire per-genre answer, since the poles come from the
 * campaign's theme.
 */
const PLATE_FRAG = `
precision highp float;
varying vec2 vUv;

uniform sampler2D uPlateA;
uniform sampler2D uPlateB;
uniform float uHasA;
uniform float uHasB;
uniform float uMix;        // 0 = A, 1 = B
uniform float uTime;
uniform float uExposure;
uniform float uGrain;
uniform float uVignette;
uniform float uBleed;
uniform float uFlash;      // white struck through the frame
uniform float uBlack;      // frame runs out to black
uniform vec3  uShadow;
uniform vec3  uMid;
uniform vec3  uHigh;
uniform vec2  uPlateScale; // aspect correction, per plate
uniform float uDrift;      // slow ken-burns push

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

/** Procedural stand-in when a saga painted no scenes — never a blank frame. */
vec3 fallbackField(vec2 uv) {
  vec2 p = uv * 3.0;
  float n = noise(p + uTime * 0.02);
  n += noise(p * 2.3 - uTime * 0.013) * 0.5;
  n += noise(p * 5.1 + uTime * 0.007) * 0.25;
  n /= 1.75;
  float radial = 1.0 - length(uv - 0.5) * 1.35;
  return vec3(clamp(n * 0.75 + radial * 0.35, 0.0, 1.0));
}

void main() {
  // A very slow push, so a held frame is never actually static.
  vec2 uv = (vUv - 0.5) * (1.0 - uDrift * 0.05) + 0.5;
  vec2 uvA = (uv - 0.5) * uPlateScale + 0.5;

  vec3 a = uHasA > 0.5 ? texture2D(uPlateA, uvA).rgb : fallbackField(uv);
  vec3 b = uHasB > 0.5 ? texture2D(uPlateB, uvA).rgb : fallbackField(uv + 0.31);
  vec3 raw = mix(a, b, uMix);

  // Luminance -> duotone. Two mixes across shadow/mid/high, then bleed the
  // original colour back in so the scene keeps some of its own identity.
  float lum = dot(raw, vec3(0.2126, 0.7152, 0.0722));
  vec3 graded = lum < 0.5
    ? mix(uShadow, uMid, smoothstep(0.0, 0.5, lum))
    : mix(uMid, uHigh, smoothstep(0.5, 1.0, lum));
  vec3 color = mix(graded, raw, uBleed);

  color *= uExposure;

  // Gate vignette — the corners of a projected frame always fall off.
  float d = length((vUv - 0.5) * vec2(1.15, 1.0));
  color *= 1.0 - smoothstep(0.34, 0.78, d) * uVignette;

  // Halation: bright areas bleed a little warmth into themselves.
  float hot = smoothstep(0.62, 1.0, lum);
  color += uHigh * hot * 0.18;

  // Film grain, resolution-independent enough to survive a 4K panel.
  float g = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 91.7) - 0.5;
  color += g * uGrain;

  color = mix(color, vec3(1.0), uFlash);
  color = mix(color, vec3(0.0), uBlack);

  gl_FragColor = vec4(max(color, 0.0), 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function OutroTheater({
  ending,
  players,
  campaignTitle,
  theme,
  plates,
  onExit
}: {
  ending: CampaignEnding;
  players: Player[];
  campaignTitle: string;
  theme?: ThemeKey | string | null;
  /**
   * The campaign's own painted scenes, oldest first. The finale holds them
   * full-frame with nothing written on them — this app generates that art all
   * saga long and has never once shown it at full scale on its own.
   */
  plates?: string[];
  onExit?: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const kind: EndingKind | "generic" = EDITS[ending.kind] ? ending.kind : "generic";
  const edit = EDITS[kind];
  const kindLabel =
    kind === "generic" && ending.kind
      ? String(ending.kind).replace(/\b\w/g, (c) => c.toUpperCase())
      : edit.label;
  const visual = themeVisual(theme);

  const [beatIndex, setBeatIndex] = useState(0);
  // Sub-beat progress, only used to slice variable content (which highlight,
  // which hero). Updated at most a few times per beat, never per frame.
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

  // Beats that have no content to show are skipped outright rather than held
  // empty — a blank card reads as a bug, not as restraint.
  const reel = useMemo(() => {
    const active = REEL.filter((beat) => {
      if (beat.id === "chronicle") return highlights.length > 0;
      if (beat.id === "ledger") return stats.length > 0;
      if (beat.id === "cast") return players.length > 0;
      if (beat.id === "plate") return true;
      return true;
    });
    return active.map((beat) => ({
      ...beat,
      seconds:
        beat.seconds === Infinity
          ? Infinity
          : (edit.metronome && beat.id !== "strike" ? edit.metronome : beat.seconds) * edit.pace
    }));
  }, [highlights.length, stats.length, players.length, edit.metronome, edit.pace]);

  const beat = reel[Math.min(beatIndex, reel.length - 1)] || reel[reel.length - 1];
  const beatId = beat?.id || "hold";

  const advance = useCallback(() => {
    seekRef.current?.(beatIndex + 1);
  }, [beatIndex]);

  const skipToEnd = useCallback(() => {
    seekRef.current?.(reel.length - 1);
  }, [reel.length]);

  /* ---------------- The projector ---------------- */
  useEffect(() => {
    const mount = mountRef.current;
    const root = rootRef.current;
    if (!mount || !root) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const disposables: Array<{ dispose: () => void }> = [];
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 60);
    camera.position.set(0, 0, 10);

    /* -------- the plate -------- */
    const grade = {
      shadow: new THREE.Color(edit.grade.shadow),
      mid: new THREE.Color(edit.grade.mid).lerp(new THREE.Color(visual.accent), visual.key === "none" ? 0 : 0.35),
      high: new THREE.Color(edit.grade.high).lerp(new THREE.Color(visual.accentBright), visual.key === "none" ? 0 : 0.3)
    };

    const plateUniforms = {
      uPlateA: { value: null as THREE.Texture | null },
      uPlateB: { value: null as THREE.Texture | null },
      uHasA: { value: 0 },
      uHasB: { value: 0 },
      uMix: { value: 0 },
      uTime: { value: 0 },
      uExposure: { value: edit.exposure },
      uGrain: { value: 0.055 },
      uVignette: { value: 0.85 },
      uBleed: { value: edit.bleed },
      uFlash: { value: 1 },
      uBlack: { value: 0 },
      uShadow: { value: grade.shadow },
      uMid: { value: grade.mid },
      uHigh: { value: grade.high },
      uPlateScale: { value: new THREE.Vector2(1, 1) },
      uDrift: { value: 0 }
    };

    const plateMaterial = new THREE.ShaderMaterial({
      vertexShader: PLATE_VERT,
      fragmentShader: PLATE_FRAG,
      uniforms: plateUniforms,
      depthWrite: false
    });
    const plateGeometry = new THREE.PlaneGeometry(1, 1);
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.z = -2;
    scene.add(plate);
    disposables.push(plateMaterial, plateGeometry);

    /* -------- dust in the beam -------- */
    // The only particles in the piece, and they're motivated: this is what a
    // projector beam looks like in a dark room. 220 motes, not 1800.
    const DUST = Math.round(220 * edit.dust);
    const dustPositions = new Float32Array(DUST * 3);
    const dustSeeds = new Float32Array(DUST);
    for (let i = 0; i < DUST; i += 1) {
      dustPositions[i * 3] = (Math.random() - 0.5) * 16;
      dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 9;
      dustPositions[i * 3 + 2] = 1 + Math.random() * 6;
      dustSeeds[i] = 0.3 + Math.random();
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
    const dustMaterial = new THREE.PointsMaterial({
      size: 0.03,
      color: new THREE.Color(visual.accentBright),
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(dust);
    disposables.push(dustGeometry, dustMaterial);

    /* -------- plate loading -------- */
    // Same-origin local files written by downloadAndSaveImage, so no CORS
    // dance. Guarded by `disposed` so a slow load can't touch a dead scene.
    const textures: THREE.Texture[] = [];
    const sources = (plates || []).filter(Boolean).slice(0, 4);
    if (sources.length) {
      const loader = new THREE.TextureLoader();
      sources.forEach((src, index) => {
        loader.load(
          src,
          (texture) => {
            if (disposed) {
              texture.dispose();
              return;
            }
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.LinearFilter;
            texture.generateMipmaps = false;
            textures[index] = texture;
            disposables.push(texture);
            if (index === 0) {
              plateUniforms.uPlateA.value = texture;
              plateUniforms.uHasA.value = 1;
            }
          },
          undefined,
          () => undefined
        );
      });
    }

    /** Cross-dissolve (or hard cut, per the edit) to the next scene. */
    let plateCursor = 0;
    const showPlate = (index: number) => {
      const next = textures[index % Math.max(textures.length, 1)];
      if (!next || next === plateUniforms.uPlateA.value) return;
      plateUniforms.uPlateB.value = next;
      plateUniforms.uHasB.value = 1;
      dissolveFrom = clock.elapsedTime;
    };
    let dissolveFrom = -1;

    /* -------- gate sizing -------- */
    const fitPlate = () => {
      const distance = camera.position.z - plate.position.z;
      const height = 2 * distance * Math.tan((camera.fov * Math.PI) / 360);
      const width = height * camera.aspect;
      plate.scale.set(width, height, 1);
      // Cover-fit the source image into the gate so a 16:9 painting never
      // letterboxes inside the letterbox.
      const source = (plateUniforms.uPlateA.value as THREE.Texture | null)?.image as
        | { width?: number; height?: number }
        | undefined;
      const sourceAspect = source?.width && source?.height ? source.width / source.height : 16 / 9;
      const gateAspect = width / Math.max(height, 0.001);
      if (gateAspect > sourceAspect) {
        plateUniforms.uPlateScale.value.set(1, gateAspect / sourceAspect);
      } else {
        plateUniforms.uPlateScale.value.set(sourceAspect / gateAspect, 1);
      }
    };

    const resize = () => {
      const w = Math.max(mount.clientWidth, 1);
      const h = Math.max(mount.clientHeight, 1);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fitPlate();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    /* -------- the single clock -------- */
    const clock = new THREE.Clock();
    let frame = 0;
    let currentBeat = -1;
    let currentSlice = -1;
    // Beat start times, recomputed whenever we seek.
    const starts: number[] = [];
    let acc = 0;
    for (const b of reel) {
      starts.push(acc);
      acc += b.seconds === Infinity ? 0 : b.seconds;
    }
    let timeOffset = 0;

    seekRef.current = (target: number) => {
      const clamped = Math.max(0, Math.min(reel.length - 1, target));
      timeOffset = clock.elapsedTime - starts[clamped];
      // Apply immediately rather than waiting for the loop to notice. A skip
      // has to feel like a cut, and a throttled rAF (backgrounded tab) must
      // not be able to swallow the input entirely.
      currentBeat = clamped;
      currentSlice = -1;
      setBeatIndex(clamped);
      setSlice(0);
    };

    /** Which highlight / hero is showing, sliced across the beat. */
    const sliceFor = (id: BeatId, progress: number) => {
      if (id === "chronicle" && highlights.length) return Math.min(highlights.length - 1, Math.floor(progress * highlights.length));
      if (id === "cast" && players.length) return Math.min(players.length - 1, Math.floor(progress * players.length));
      return 0;
    };

    /* -------- terminal events: they happen to the WHOLE FRAME -------- */
    // Every terminal RESOLVES. It peaks during `fin` and then settles into a
    // calm frame that FIN and the leave button are legible against, because
    // this screen holds for twenty minutes while the table talks — a finale
    // that ends on a pure-white or fully-shut frame is a screen nobody can
    // read and, on an OLED in a dark room, a screen nobody should leave up.
    //
    // `p` runs 0..1 across the fin beat; `settled` is the indefinite hold.
    const RESOLVED_GATE = 0.3;
    const applyTerminal = (progress: number, settled: boolean) => {
      const p = settled ? 1 : Math.max(0, Math.min(1, progress));
      // A hump: strike hard at ~70% through the beat, then fall away.
      const hump = settled ? 0 : Math.sin(Math.min(1, p / 0.75) * Math.PI * 0.5) * (1 - Math.max(0, (p - 0.75) / 0.25));
      switch (edit.terminal) {
        case "whiteout":
          // The light takes everything — then gives the frame back, blown out
          // and warm, with the seal standing in it.
          plateUniforms.uExposure.value = edit.exposure + hump * 4.5;
          plateUniforms.uFlash.value = Math.pow(hump, 1.6) * 0.95;
          if (settled) plateUniforms.uExposure.value = edit.exposure * 1.25;
          break;
        case "closing": {
          // Two slabs shut the doorway. They stop at a narrow letterbox rather
          // than sealing, so the last word is still readable in the gap.
          const shut = Math.pow(p, 1.6);
          root.style.setProperty("--gate", String(edit.aperture + (RESOLVED_GATE - edit.aperture) * shut));
          plateUniforms.uExposure.value = edit.exposure * (1 - shut * 0.45);
          break;
        }
        case "punch":
          // Out into open sky, then the lens settles.
          camera.fov = 48 + hump * 22;
          camera.updateProjectionMatrix();
          fitPlate();
          plateUniforms.uFlash.value = Math.pow(hump, 3) * 0.8;
          break;
        case "halt": {
          // The reel stalls, jitters in the gate, and runs out mid-sentence.
          // A cliffhanger is the one ending allowed to end on black.
          const stall = p > 0.5 ? Math.min(1, (p - 0.5) / 0.5) : 0;
          plateUniforms.uBlack.value = stall * 0.92;
          root.style.setProperty(
            "--jitter",
            String(!settled && p > 0.35 ? (Math.random() - 0.5) * 16 * p : 0)
          );
          break;
        }
        case "even": {
          // Matched bars converge from both sides at identical speed. Neither
          // side arrives first; that is the entire point.
          root.style.setProperty("--gate", String(edit.aperture + (RESOLVED_GATE - edit.aperture) * Math.pow(p, 1.3)));
          break;
        }
        default:
          plateUniforms.uBlack.value = Math.pow(p, 1.8) * 0.7;
      }
    };

    const renderFrame = (t: number) => {
      plateUniforms.uTime.value = t;

      // Beat resolution — the ONLY place the reel advances.
      const reelTime = t - timeOffset;
      let index = 0;
      for (let i = 0; i < reel.length; i += 1) {
        const start = starts[i];
        const end = i + 1 < reel.length ? starts[i + 1] : Infinity;
        if (reelTime >= start && reelTime < end) {
          index = i;
          break;
        }
      }
      const id = reel[index].id;
      const span = reel[index].seconds;
      const progress = span === Infinity ? 0 : Math.max(0, Math.min(1, (reelTime - starts[index]) / span));

      if (index !== currentBeat) {
        currentBeat = index;
        setBeatIndex(index);
        currentSlice = -1;
        // A new picture on the beats that are about a picture.
        if (id === "plate" || id === "epilogue" || id === "cast") {
          plateCursor += 1;
          showPlate(plateCursor);
        }
      }
      const nextSlice = sliceFor(id, progress);
      if (nextSlice !== currentSlice) {
        currentSlice = nextSlice;
        setSlice(nextSlice);
      }

      // Cross-dissolve (hard cut when the edit forbids dissolves).
      if (dissolveFrom >= 0) {
        const dissolve = edit.dissolve <= 0 ? 1 : Math.min(1, (t - dissolveFrom) / edit.dissolve);
        plateUniforms.uMix.value = dissolve;
        if (dissolve >= 1) {
          plateUniforms.uPlateA.value = plateUniforms.uPlateB.value;
          plateUniforms.uHasA.value = plateUniforms.uHasB.value;
          plateUniforms.uMix.value = 0;
          dissolveFrom = -1;
          fitPlate();
        }
      }

      // The strike: the gate snaps open and the lamp hits the frame.
      if (id === "strike") {
        const open = Math.pow(progress, 0.55);
        root.style.setProperty("--gate", String(edit.aperture * open));
        plateUniforms.uFlash.value = Math.max(0, 1 - progress * 3.2);
        plateUniforms.uExposure.value = edit.exposure * (0.6 + open * 0.4);
      } else if (id === "fin" || id === "hold") {
        applyTerminal(progress, id === "hold");
      } else {
        root.style.setProperty("--gate", String(edit.aperture));
        plateUniforms.uExposure.value = edit.exposure;
        plateUniforms.uFlash.value = 0;
      }

      // Gate weave — the frame breathes in its gate, never perfectly still.
      const weave = edit.weave * (id === "hold" ? 0.25 : 1);
      plate.position.x = Math.sin(t * 1.7) * 0.006 * weave;
      plate.position.y = Math.cos(t * 2.3 + 1.1) * 0.005 * weave;
      plateUniforms.uDrift.value = Math.sin(t * 0.06) * 0.5 + 0.5;

      // Dust drifts through the beam. Halved on the indefinite hold, because
      // this frame will sit on a TV for twenty minutes while people talk.
      const holding = id === "hold";
      if (!holding || Math.floor(t * 30) % 2 === 0) {
        for (let i = 0; i < DUST; i += 1) {
          const px = i * 3;
          dustPositions[px + 1] += dustSeeds[i] * 0.055 * (holding ? 0.3 : 1) * 0.016;
          if (dustPositions[px + 1] > 4.5) dustPositions[px + 1] = -4.5;
          dustPositions[px] += Math.sin(t * 0.4 + dustSeeds[i] * 7) * 0.0015;
        }
        dustGeometry.attributes.position.needsUpdate = true;
      }
      dustMaterial.opacity = (holding ? 0.16 : 0.32) * (id === "strike" ? progress : 1);

      renderer.render(scene, camera);
    };

    if (reducedMotion) {
      // Render the finale's last frame once — a still, not a bail-out. The old
      // implementation returned early here and left a bare CSS gradient.
      root.style.setProperty("--gate", String(edit.aperture));
      plateUniforms.uFlash.value = 0;
      plateUniforms.uExposure.value = edit.exposure;
      renderer.render(scene, camera);
      // The words still need to advance, so drive the reel on timers instead.
      let index = 0;
      const timers: Array<ReturnType<typeof setTimeout>> = [];
      let at = 0;
      for (let i = 0; i < reel.length; i += 1) {
        const target = i;
        timers.push(setTimeout(() => setBeatIndex(target), at * 1000));
        at += reel[i].seconds === Infinity ? 0 : reel[i].seconds;
      }
      void index;
      return () => {
        disposed = true;
        for (const timer of timers) clearTimeout(timer);
        observer.disconnect();
        for (const item of disposables) item.dispose();
        renderer.dispose();
        if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      };
    }

    const loop = () => {
      frame = requestAnimationFrame(loop);
      renderFrame(clock.getElapsedTime());
    };
    frame = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      seekRef.current = null;
      for (const item of disposables) item.dispose();
      for (const texture of textures) texture.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
    // The whole projector is rebuilt when the ending kind or theme changes
    // (the debug gallery does exactly that).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, visual.key, reel.length]);

  /* ---------------- Skip / advance ---------------- */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === " " || event.key === "Enter" || event.key === "ArrowRight") {
        event.preventDefault();
        advance();
      } else if (event.key === "End" || event.key === "Escape") {
        event.preventDefault();
        skipToEnd();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, skipToEnd]);

  /* ---------------- The band ---------------- */
  // Every card lives in the SAME grid cell and cross-fades. Nothing scrolls,
  // nothing reflows, and the slot is the same size for a one-word title and a
  // twelve-word one.

  const titleWords = useMemo(() => ending.title.trim().split(/\s+/).slice(0, 16), [ending.title]);
  const activePlayer = players[Math.min(slice, players.length - 1)];
  const activeMember = activePlayer ? castByPlayer.get(activePlayer.id) : undefined;
  const showBand = beatId !== "strike" && beatId !== "plate";

  return (
    <div
      ref={rootRef}
      className={`reel reel-${kind} reel-beat-${beatId}`}
      style={{ ["--gate" as string]: String(edit.aperture) }}
      onClick={(event) => {
        event.stopPropagation();
        advance();
      }}
    >
      <div ref={mountRef} className="reel-gate" aria-hidden />
      <div className="reel-matte reel-matte-top" aria-hidden />
      <div className="reel-matte reel-matte-bottom" aria-hidden />

      <div className={`reel-band ${showBand ? "is-lit" : ""}`}>
        {/* KIND — small, tracked, alone on the frame. */}
        <div className={`reel-card reel-card-kind ${beatId === "kind" ? "is-on" : ""}`}>
          <span className="reel-kicker">{campaignTitle}</span>
          <span className="reel-kind">{kindLabel}</span>
        </div>

        {/* TITLE — the one moment allowed to be enormous. */}
        <div className={`reel-card reel-card-title ${beatId === "title" ? "is-on" : ""}`}>
          <h1 className="reel-title" data-len={titleWords.length > 8 ? "long" : titleWords.length > 4 ? "mid" : "short"}>
            {titleWords.map((word, index) => (
              <span key={index} className="reel-word" style={{ ["--i" as string]: index }}>
                {word}
              </span>
            ))}
          </h1>
        </div>

        {/* EPILOGUE — a subtitle, hard-cut, never crossfaded. */}
        <div className={`reel-card reel-card-epilogue ${beatId === "epilogue" ? "is-on" : ""}`}>
          <p className="reel-subtitle">{ending.summary}</p>
        </div>

        {/* CHRONICLE — one line at a time, sliced across a fixed beat. */}
        <div className={`reel-card reel-card-chronicle ${beatId === "chronicle" ? "is-on" : ""}`}>
          <span className="reel-label">The Chronicle</span>
          <p key={slice} className="reel-intertitle">
            {highlights[Math.min(slice, Math.max(highlights.length - 1, 0))]}
          </p>
        </div>

        {/* LEDGER — no cards. A hairline rule, a big number, a tiny label. */}
        <div className={`reel-card reel-card-ledger ${beatId === "ledger" ? "is-on" : ""}`}>
          <span className="reel-label">The Ledger</span>
          <div className="reel-ledger">
            {stats.map((stat, index) => (
              <div key={index} className="reel-entry" style={{ ["--i" as string]: index }}>
                <span className="reel-entry-value">{stat.value}</span>
                <span className="reel-entry-label">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CAST — one hero holds the frame at a time. */}
        <div className={`reel-card reel-card-cast ${beatId === "cast" ? "is-on" : ""}`}>
          {activePlayer ? (
            <div key={activePlayer.id} className="reel-cast">
              <div
                className="reel-face"
                style={{ ["--seat" as string]: accentColor(activePlayer.color) }}
              >
                {activePlayer.portraitUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={activePlayer.portraitUrl} alt="" />
                ) : (
                  // Composed as the design, not as a hole: a struck blank with
                  // the hero's initial and the campaign's own glyph.
                  <span className="reel-face-blank">
                    <span className="reel-face-initial">
                      {(activePlayer.characterName || activePlayer.name || "?").trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="reel-face-glyph" style={{ fontFamily: visual.glyphFont.replace(/^[\d.]+px\s*/, "") }}>
                      {visual.glyphs.charAt(players.indexOf(activePlayer) % visual.glyphs.length)}
                    </span>
                  </span>
                )}
              </div>
              <div className="reel-cast-lines">
                <span className="reel-cast-name" style={{ color: accentColor(activePlayer.color) }}>
                  {activePlayer.characterName || activePlayer.name}
                </span>
                {activeMember?.title ? <span className="reel-cast-epithet">{activeMember.title}</span> : null}
                {activePlayer.characterName ? <span className="reel-cast-player">{activePlayer.name}</span> : null}
                {activeMember?.fate ? <p className="reel-cast-fate">{activeMember.fate}</p> : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* FIN */}
        <div className={`reel-card reel-card-fin ${beatId === "fin" || beatId === "hold" ? "is-on" : ""}`}>
          <span className="reel-fin">{edit.fin}</span>
        </div>
      </div>

      {beatId === "hold" && onExit ? (
        <button
          className="reel-leave"
          onClick={(event) => {
            event.stopPropagation();
            onExit();
          }}
        >
          Leave the table
        </button>
      ) : null}

      {beatId !== "hold" ? (
        <button
          className="reel-skip"
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
