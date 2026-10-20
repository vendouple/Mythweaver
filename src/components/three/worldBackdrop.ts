"use client";

import * as THREE from "three";
import type { MusicPulse } from "@/lib/client/musicPulse";
import type { ThemeKey, ThemeVisual } from "./themeVisuals";
import { createThemeEnvironment, type ThemeEnvironment } from "./themeEnvironments";
import { createTracker } from "./sceneKit";

/* ═══════════════════════════════════════════════════════════════════════════
   THE WOVEN BACKDROP — the theme's full environment (themeEnvironments.ts:
   Aurora Vale, Rain City, the Moonlit Sea…), rendered off-screen and laid
   onto the frame through a REVEAL that is different for every genre.

   The Weaving literally weaves the world into view: the cozy table knits it
   row by row like a loom, sci-fi scans it in top-down, noir opens it like
   venetian blinds, the wasteland burns through, the pirate world rises on
   the tide, east-asian bleeds in as ink, the capes pop in as halftone dots,
   steampunk sweeps it round like a clock hand. The finale reuses the same
   reveal for its opening beat — the bookend is literal — and adds the
   grades its fates need: dawn, embers, the half-light split, frost, the
   glitch of a rift, and the long recede into a single star.

   Pipeline per frame (no allocation):
     env scene ──► half-float target ──► composite quad (reveal + grade)
   then the caller draws its foreground over the same target.
   ═══════════════════════════════════════════════════════════════════════ */

/** Reveal pattern per theme (index into the composite shader's field()). */
export const REVEAL_MODE: Record<ThemeKey, number> = {
  none: 0,
  fantasy: 1,
  scifi: 2,
  horror: 3,
  noir: 4,
  modern: 5,
  western: 6,
  postapoc: 7,
  cyberpunk: 8,
  spaceopera: 9,
  gothic: 10,
  urbanfantasy: 11,
  steampunk: 12,
  pirate: 13,
  eastasian: 14,
  superhero: 15,
  pulp: 16,
  cozy: 17
};

/** Edge softness per reveal (ink bleeds wide, a scanline is a hairline). */
const REVEAL_SOFT: number[] = [0.03, 0.08, 0.025, 0.1, 0.05, 0.05, 0.05, 0.06, 0.06, 0.05, 0.04, 0.06, 0.03, 0.05, 0.14, 0.06, 0.035, 0.09];

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = `
uniform sampler2D uWorld;
uniform float uReveal;
uniform float uMode;
uniform float uSoft;
uniform float uTime;
uniform float uAspect;
uniform vec2 uCenter;
uniform vec3 uEdge;
uniform float uEdgeGain;
uniform float uAstral;
uniform vec3 uNeb0;
uniform vec3 uNeb1;
uniform vec3 uVoid;
uniform float uVoidAlpha;
uniform float uDawn;
uniform vec3 uDawnCol;
uniform vec2 uSun;
uniform float uEmber;
uniform vec3 uEmberCol;
uniform float uSplit;
uniform float uFrost;
uniform vec3 uFrostCol;
uniform float uGlitch;
uniform float uRecede;
uniform float uLift;
uniform float uFocus;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

// The reveal field: a pixel is woven in once uReveal passes field(uv).
float field(vec2 uv, int mode) {
  vec2 c = (uv - uCenter) * vec2(uAspect, 1.0);
  float r = length(c);
  float ang = atan(c.y, c.x);
  float maxR = length(vec2(max(uCenter.x, 1.0 - uCenter.x) * uAspect, max(uCenter.y, 1.0 - uCenter.y)));
  float rn = r / maxR;
  if (mode == 0) { // loom: rows woven bottom-up, the shuttle alternating sides
    float rows = 18.0;
    float row = floor(uv.y * rows);
    float along = mod(row, 2.0) < 0.5 ? uv.x : 1.0 - uv.x;
    float weave = mod(floor(uv.x * 72.0) + row, 2.0) * 0.01;
    return (row + along * 0.94) / rows + weave;
  }
  if (mode == 1) return rn * 0.82 + fbm(uv * 5.0) * 0.18; // embroidery from the heart
  if (mode == 2) return (1.0 - uv.y) * 0.92 + hash(floor(vec2(uv.x * 18.0, uv.y * 96.0))) * 0.08; // scan
  if (mode == 3) return rn * 0.55 + fbm(uv * 4.0 + uTime * 0.04) * 0.45; // the dark withdraws, reluctantly
  if (mode == 4) return abs(fract(uv.y * 12.0) - 0.5) * 1.6 + abs(uv.x - 0.5) * 0.2; // venetian blinds
  if (mode == 5) return hash(floor(uv * vec2(16.0, 9.0))) * 0.8 + (1.0 - uv.y) * 0.2; // tiles go live
  if (mode == 6) return uv.y * 0.9 + sin(uv.x * 18.0 + uTime * 2.0) * 0.012 + fbm(vec2(uv.x * 6.0, uTime * 0.3)) * 0.08; // heat
  if (mode == 7) return fbm(uv * 3.5) * 0.62 + rn * 0.38; // burn-through
  if (mode == 8) return (1.0 - uv.y) * 0.55 + hash(vec2(floor(uv.x * 56.0), 3.0)) * 0.45; // code rain
  if (mode == 9) return rn * (0.88 + 0.12 * sin(ang * 8.0)); // star iris
  if (mode == 10) { // stained glass shards
    vec2 g = uv * vec2(uAspect, 1.0) * 6.0;
    vec2 id = floor(g); vec2 best = id; float bd = 9.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 cell = id + vec2(float(x), float(y));
      vec2 pt = cell + vec2(hash(cell), hash(cell + 7.3));
      float d = length(g - pt);
      if (d < bd) { bd = d; best = cell; }
    }
    return hash(best + 1.7) * 0.6 + rn * 0.4;
  }
  if (mode == 11) return rn * 0.72 + fract(ang / 6.2832 + rn * 1.4) * 0.28; // sigil spiral
  if (mode == 12) return fract(0.25 - ang / 6.2832) * 0.92 + rn * 0.08; // clock hand sweep
  if (mode == 13) return uv.y * 0.88 + sin(uv.x * 10.0 + uTime * 1.6) * 0.025 + sin(uv.x * 23.0 - uTime * 2.3) * 0.012 + 0.05; // tide
  if (mode == 14) return fbm(uv * 2.4) * 0.55 + rn * 0.45; // ink bleed
  if (mode == 15) return (1.0 - uv.x) * 0.3 + rn * 0.7; // halftone (dot size handled in main)
  if (mode == 16) return uv.x * 0.9 + fbm(vec2(uv.y * 9.0, 1.3)) * 0.1; // map unrolls, torn edge
  // 17 cozy: soft blossoms opening across the frame
  vec2 g = uv * vec2(7.0, 4.0);
  vec2 id = floor(g);
  vec2 ctr = id + 0.5 + (vec2(hash(id), hash(id + 3.1)) - 0.5) * 0.5;
  return clamp(hash(id + 9.2) * 0.55 + length((g - ctr) * vec2(1.0, 1.0)) * 0.6, 0.0, 1.0);
}

vec3 astral(vec2 uv) {
  vec2 p = uv * vec2(uAspect, 1.0);
  float n = fbm(p * 1.6 + vec2(uTime * 0.01, 0.0));
  float m = fbm(p * 2.7 - vec2(0.0, uTime * 0.008));
  vec3 col = uVoid * 1.6;
  col += uNeb0 * pow(n, 2.6) * 0.55;
  col += uNeb1 * pow(m, 3.2) * 0.4;
  vec2 cell = floor(p * 90.0);
  float star = step(0.985, hash(cell)) * (0.5 + 0.5 * sin(uTime * 2.0 + hash(cell + 2.0) * 30.0));
  col += vec3(star) * 0.6;
  return col;
}

void main() {
  vec2 uv = vUv;
  // The leaving: the whole world draws back into a shrinking orb of itself.
  float orb = 1.0;
  vec2 rc = vec2(0.5, 0.56);
  if (uRecede > 0.001) {
    float k = pow(uRecede, 0.75);
    float scale = mix(1.0, 0.012, k);
    vec2 d = (uv - rc) * vec2(uAspect, 1.0);
    float orbR = mix(1.4, 0.006, k);
    orb = smoothstep(orbR, orbR * 0.82, length(d));
    uv = rc + (uv - rc) / scale;
  }
  // The rift's glitch: torn rows slide and the channels split.
  vec2 off = vec2(0.0);
  if (uGlitch > 0.001) {
    float row = floor(vUv.y * 46.0);
    float tick = floor(uTime * 11.0);
    float h = hash(vec2(row, tick));
    if (h < uGlitch * 0.35) off.x = (hash(vec2(row + 4.0, tick)) - 0.5) * 0.09 * uGlitch;
  }
  vec2 ca = vec2(uGlitch * 0.004, 0.0);
  vec3 world;
  if (uAstral > 0.5) world = astral(uv + off);
  else world = vec3(texture2D(uWorld, uv + off + ca).r, texture2D(uWorld, uv + off).g, texture2D(uWorld, uv + off - ca).b);
  world *= uLift;

  int mode = int(uMode + 0.5);
  float f = field(vUv, mode);
  if (uFocus > 0.0) f = mix(f, f * 0.35 + length((vUv - uCenter) * vec2(uAspect, 1.0)) * 0.9, uFocus);
  float soft = uSoft;
  float r = uReveal * (1.0 + soft + 0.02) - 0.01;
  float a = smoothstep(f, f + soft, r);
  if (mode == 15) { // halftone: dots swell from nothing to full coverage
    vec2 g = vUv * vec2(uAspect, 1.0) * 46.0;
    float d = length(fract(g) - 0.5);
    float grow = clamp((r - f) / 0.22, 0.0, 1.0);
    a = smoothstep(grow * 0.75 + 0.02, grow * 0.75 - 0.02, d);
    if (grow >= 0.999) a = 1.0;
  }
  float live = step(0.001, uReveal) * (1.0 - step(0.999, uReveal));
  if (mode == 15) live = 0.0;
  float edge = exp(-abs(r - f - soft * 0.5) / (soft * 0.2 + 0.003)) * live * (0.35 + 0.65 * fbm(vUv * 9.0 + uTime * 0.3));

  // Fates grade the world itself.
  float right = smoothstep(0.49, 0.51, vUv.x);
  float dawn = uDawn * mix(1.0, right, uSplit);
  float ember = uEmber * mix(1.0, 1.0 - right, uSplit);
  if (dawn > 0.001) {
    float d = length((vUv - uSun) * vec2(uAspect, 1.0));
    world = mix(world, world * uDawnCol * 1.5, dawn * 0.3);
    world += uDawnCol * dawn * (exp(-d * 3.0) * 0.3 + pow(1.0 - vUv.y, 2.0) * 0.06);
  }
  if (ember > 0.001) {
    float lum = dot(world, vec3(0.3, 0.59, 0.11));
    world = mix(world, vec3(lum) * vec3(0.9, 0.62, 0.52), ember * 0.7) * (1.0 - ember * 0.45 * smoothstep(0.2, 1.0, vUv.y));
    world += uEmberCol * ember * 0.28 * pow(1.0 - vUv.y, 2.6);
  }
  if (uSplit > 0.001) {
    float seam = exp(-abs(vUv.x - 0.5) * uAspect * 160.0) * uSplit;
    world += mix(uEmberCol, uDawnCol, 0.5) * seam * 0.9;
  }
  if (uFrost > 0.001) {
    float lum = dot(world, vec3(0.3, 0.59, 0.11));
    world = mix(world, lum * uFrostCol * 1.35 + uFrostCol * 0.025, uFrost * 0.8);
  }

  vec3 voidCol = uVoid;
  vec3 col = mix(voidCol * uVoidAlpha, world, a) * orb + uEdge * edge * uEdgeGain * 0.55;
  float alpha = clamp(max(a * orb, uVoidAlpha) + edge * uEdgeGain * 0.3, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}`;

export type BackdropFrame = {
  t: number;
  dt: number;
  /** Environment envelope (its additive layers' strength). */
  envelope: number;
  drive: number;
  pulse: MusicPulse;
};

export type WorldBackdrop = {
  uniforms: {
    uReveal: { value: number };
    uCenter: { value: THREE.Vector2 };
    uEdgeGain: { value: number };
    uVoidAlpha: { value: number };
    uDawn: { value: number };
    uSun: { value: THREE.Vector2 };
    uEmber: { value: number };
    uSplit: { value: number };
    uFrost: { value: number };
    uGlitch: { value: number };
    uRecede: { value: number };
    uLift: { value: number };
    uFocus: { value: number };
    uTime: { value: number };
  };
  setSize: (width: number, height: number, pixelRatio: number) => void;
  /** Renders env → target, then the composite into `target` (null = screen). */
  render: (renderer: THREE.WebGLRenderer, camera: THREE.Camera, frame: BackdropFrame, target: THREE.WebGLRenderTarget | null) => void;
  dispose: () => void;
};

export function createWorldBackdrop(visual: ThemeVisual): WorldBackdrop {
  const tracker = createTracker();
  const envScene = new THREE.Scene();
  // Same framing the cosmos uses (camera z≈11, fov 52) so every environment
  // fills the frame exactly as it was composed.
  let env: ThemeEnvironment | null = createThemeEnvironment(envScene, visual, { width: 48, height: 26, z: -12, full: true });
  const target = tracker.track(new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true }));
  const uniforms = {
    uWorld: { value: target.texture },
    uReveal: { value: 0 },
    uMode: { value: REVEAL_MODE[visual.key] ?? 0 },
    uSoft: { value: REVEAL_SOFT[REVEAL_MODE[visual.key] ?? 0] ?? 0.05 },
    uTime: { value: 0 },
    uAspect: { value: 16 / 9 },
    uCenter: { value: new THREE.Vector2(0.5, 0.45) },
    uEdge: { value: new THREE.Color(visual.accentBright) },
    uEdgeGain: { value: 0.9 },
    uAstral: { value: env ? 0 : 1 },
    uNeb0: { value: new THREE.Color(visual.nebulae[0]) },
    uNeb1: { value: new THREE.Color(visual.nebulae[1]) },
    uVoid: { value: new THREE.Color(visual.fog) },
    uVoidAlpha: { value: 0 },
    uDawn: { value: 0 },
    uDawnCol: { value: new THREE.Color("#ffd28a").lerp(new THREE.Color(visual.accentBright), 0.25) },
    uSun: { value: new THREE.Vector2(0.5, 0.35) },
    uEmber: { value: 0 },
    uEmberCol: { value: new THREE.Color("#ff5a2a").lerp(new THREE.Color(visual.accent), 0.2) },
    uSplit: { value: 0 },
    uFrost: { value: 0 },
    uFrostCol: { value: new THREE.Color("#bcd4ee") },
    uGlitch: { value: 0 },
    uRecede: { value: 0 },
    uLift: { value: 1 },
    uFocus: { value: 0 }
  };
  const material = tracker.track(new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.NoBlending
  }));
  const quadGeometry = tracker.track(new THREE.PlaneGeometry(2, 2));
  const quad = new THREE.Mesh(quadGeometry, material);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const clear = new THREE.Color();

  return {
    uniforms,
    setSize: (width, height, pixelRatio) => {
      // The backdrop is soft by nature; it never needs more than ~1.25x.
      const ratio = Math.min(pixelRatio, 1.25);
      target.setSize(Math.max(4, Math.round(width * ratio)), Math.max(4, Math.round(height * ratio)));
      uniforms.uAspect.value = width / Math.max(1, height);
    },
    render: (renderer, camera, frame, out) => {
      uniforms.uTime.value = frame.t;
      if (env && uniforms.uReveal.value > 0.001) {
        env.update({ t: frame.t, dt: frame.dt, envelope: frame.envelope, drive: frame.drive, pulse: frame.pulse });
        renderer.getClearColor(clear);
        const alpha = renderer.getClearAlpha();
        renderer.setRenderTarget(target);
        renderer.setClearColor(0x000000, 1);
        renderer.clear();
        renderer.render(envScene, camera);
        renderer.setClearColor(clear, alpha);
      }
      renderer.setRenderTarget(out);
      renderer.clear();
      renderer.render(quadScene, quadCamera);
    },
    dispose: () => {
      env?.dispose();
      env = null;
      tracker.dispose();
    }
  };
}
