"use client";

import * as THREE from "three";
import type { MusicPulse } from "@/lib/client/musicPulse";
import type { ThemeKey, ThemeVisual } from "./themeVisuals";

/* ═══════════════════════════════════════════════════════════════════════════
   THEME ENVIRONMENTS — one hand-built, music-synced world per campaign theme.

   The old signature layers shared six generic effects across seventeen
   themes (cyberpunk and noir both got "rain", pirate and western both got
   "dust"), and none of them listened to the score. Each theme now owns a
   complete environment with its own answer to every instrument:

     theme         world                        kick / snare / hats / swell
     ───────────── ──────────────────────────── ───────────────────────────────
     fantasy       Aurora Vale                  firefly bloom / rune flare /
                                                firefly twinkle / aurora surge
     scifi         Hyperlane                    warp jump / scanner ring /
                                                data glints / grid glow
     horror        The Hollow                   heartbeat throb / eyes open /
                                                spore drift / fog rise
     noir          Rain City                    puddle rings / blind sweep /
                                                neon buzz / rain density
     modern        Night Ops                    radar ping / laser sweep /
                                                bokeh glints / searchlight
     western       High Noon                    dust gust / sun flare /
                                                heat shimmer / haze
     postapoc      Ashfall                      ground shock / toxic bolt /
                                                geiger crackle / ash storm
     cyberpunk     Neon Grid                    floor pulse / glitch slice /
                                                holo rain / skyline EQ (live)
     spaceopera    Fleet Nebula                 engine burn / laser volley /
                                                star twinkle / nebula bloom
     gothic        Cathedral Night              bat scatter / bell ring /
                                                candle flicker / rose window
     urbanfantasy  Hidden Ley                   ley pulse / sigil flare /
                                                pixie sparks / ley glow
     steampunk     Clockwork Sky                gear tick / steam vent /
                                                brass sparks / boiler glow
     pirate        Moonlit Sea                  wave crest / sea spray /
                                                star glints / swell height
     eastasian     Lantern Festival             lantern lift / petal gust /
                                                firefly glints / moon glow
     superhero     Signal City                  impact lines / halftone pop /
                                                window twinkle / signal beam
     pulp          Lost Expedition              torch flare / route advance /
                                                dust motes / canopy rays
     cozy          Hearth Meadow                firefly bloom / seed puff /
                                                twinkle / sunset warmth

   One builder serves two hosts:
     full  (CosmosCanvas)  — the whole backdrop: opaque skylines, mountains,
                             seas, moons. The theme IS the scene.
     !full (StageAtmosphere) — a light additive overlay on top of the painted
                             AI backdrop: no opaque silhouettes, lower counts.

   Every material is fog-free (the cosmos fog would swallow a backdrop
   placed 30 units out) and every texture is canvas-built, so nothing is
   fetched. Per-frame work is plain typed-array math with no allocation.
   ═══════════════════════════════════════════════════════════════════════ */

export type ThemeEnvironmentOptions = {
  /** Horizontal world span to fill at depth `z` (centered on 0). */
  width: number;
  /** Vertical world span at depth `z` (centered on 0). */
  height: number;
  /** Base depth. Elements spread behind it (more negative). */
  z: number;
  /** True for a full backdrop (opaque silhouettes allowed); false for an overlay. */
  full: boolean;
};

export type ThemeEnvironmentFrame = {
  t: number;
  dt: number;
  /** Master visibility 0..1 (mood intensity, gutter, fades). */
  envelope: number;
  /** Scene energy multiplier, ~0.4..1.3. */
  drive: number;
  pulse: MusicPulse;
};

export type ThemeEnvironment = {
  update: (frame: ThemeEnvironmentFrame) => void;
  dispose: () => void;
};

/* ------------------------------------------------------------------ */
/* Build kit                                                            */
/* ------------------------------------------------------------------ */

type Kit = {
  scene: THREE.Scene;
  visual: ThemeVisual;
  W: number;
  H: number;
  Z: number;
  full: boolean;
  /** Count scaler: 1 in full mode, lighter as an overlay. */
  n: (count: number) => number;
  root: THREE.Group;
  track: <T extends { dispose: () => void }>(item: T) => T;
  glow: THREE.CanvasTexture;
  rand: () => number;
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const TAU = Math.PI * 2;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function glowTexture() {
  return canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.55)");
    g.addColorStop(0.6, "rgba(255,255,255,0.12)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

/** Feathered vertical shaft: bright top (or bottom), dissolving away, soft sides. */
function shaftTexture(fromBottom = false) {
  return canvasTexture(64, 256, (ctx) => {
    const v = fromBottom ? ctx.createLinearGradient(0, 256, 0, 0) : ctx.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, "rgba(255,255,255,0.9)");
    v.addColorStop(0.6, "rgba(255,255,255,0.2)");
    v.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 64, 256);
    ctx.globalCompositeOperation = "destination-in";
    const h = ctx.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, "rgba(255,255,255,0)");
    h.addColorStop(0.5, "rgba(255,255,255,1)");
    h.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = h;
    ctx.fillRect(0, 0, 64, 256);
  });
}

/** Horizontal streak, hot head at the right. */
function streakTexture() {
  return canvasTexture(256, 16, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.8, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 16);
    ctx.globalCompositeOperation = "destination-in";
    const v = ctx.createLinearGradient(0, 0, 0, 16);
    v.addColorStop(0, "rgba(255,255,255,0)");
    v.addColorStop(0.5, "rgba(255,255,255,1)");
    v.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 256, 16);
  });
}

function additive(color: THREE.ColorRepresentation, opacity: number, map?: THREE.Texture | null) {
  return new THREE.MeshBasicMaterial({
    color,
    map: map ?? null,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false
  });
}

function spriteMat(kit: Kit, color: THREE.ColorRepresentation, opacity: number, map: THREE.Texture = kit.glow) {
  return kit.track(new THREE.SpriteMaterial({
    map,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    fog: false
  }));
}

function sprite(kit: Kit, color: THREE.ColorRepresentation, opacity: number, x: number, y: number, z: number, sx: number, sy = sx) {
  const s = new THREE.Sprite(spriteMat(kit, color, opacity));
  s.position.set(x, y, z);
  s.scale.set(sx, sy, 1);
  kit.root.add(s);
  return s;
}

/** A soft additive point cloud with a typed position buffer. */
function cloud(kit: Kit, count: number, color: THREE.ColorRepresentation, size: number, opacity: number, vertexColors = false) {
  const positions = new Float32Array(count * 3);
  const geometry = kit.track(new THREE.BufferGeometry());
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  let colors: Float32Array | null = null;
  if (vertexColors) {
    colors = new Float32Array(count * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }
  const material = kit.track(new THREE.PointsMaterial({
    color: vertexColors ? 0xffffff : color,
    map: kit.glow,
    // The radial glow map leaves only a small hot core, so a mapped point
    // reads far smaller than a solid one of the same size.
    size: size * 2.4,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    vertexColors,
    fog: false
  }));
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  kit.root.add(points);
  const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
  return { positions, colors, geometry, material, points, attr, count };
}

/** Line segments with a mutable buffer (two vertices per segment). */
function segments(kit: Kit, count: number, color: THREE.ColorRepresentation, opacity: number) {
  const positions = new Float32Array(count * 6);
  const geometry = kit.track(new THREE.BufferGeometry());
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = kit.track(new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    fog: false
  }));
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  kit.root.add(lines);
  const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
  return { positions, geometry, material, lines, attr };
}

/**
 * Opaque silhouette from a top-edge profile (x,y pairs left→right) filled
 * down to `bottom`. Full mode only — it would hide the painted backdrop.
 */
function silhouette(kit: Kit, profile: Array<[number, number]>, bottom: number, z: number, color: THREE.ColorRepresentation, rim?: { color: THREE.ColorRepresentation; opacity: number }) {
  const shape = new THREE.Shape();
  shape.moveTo(profile[0][0], bottom);
  for (const [x, y] of profile) shape.lineTo(x, y);
  shape.lineTo(profile[profile.length - 1][0], bottom);
  shape.closePath();
  const geometry = kit.track(new THREE.ShapeGeometry(shape));
  const material = kit.track(new THREE.MeshBasicMaterial({ color, fog: false, depthWrite: false }));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = z;
  mesh.renderOrder = -10;
  kit.root.add(mesh);
  let rimLine: THREE.Line | null = null;
  let rimMaterial: THREE.LineBasicMaterial | null = null;
  if (rim) {
    const rimGeometry = kit.track(new THREE.BufferGeometry().setFromPoints(profile.map(([x, y]) => new THREE.Vector3(x, y, 0))));
    rimMaterial = kit.track(new THREE.LineBasicMaterial({ color: rim.color, transparent: true, opacity: rim.opacity, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false }));
    rimLine = new THREE.Line(rimGeometry, rimMaterial);
    rimLine.position.z = z + 0.01;
    kit.root.add(rimLine);
  }
  return { mesh, material, rimLine, rimMaterial };
}

/**
 * The sky behind a full environment: a vertical gradient (zenith → mid →
 * horizon glow → ground) on one huge plane at the back. Full mode only; an
 * overlay must leave the painted backdrop visible.
 */
const SKIES: Partial<Record<ThemeKey, [string, string, string]>> = {
  fantasy: ["#04051a", "#121638", "#2c2556"],
  scifi: ["#01030a", "#04122a", "#0b2c4c"],
  horror: ["#020301", "#090c06", "#1c2111"],
  noir: ["#04060a", "#0e121a", "#222a38"],
  modern: ["#02060a", "#06141c", "#0f2a32"],
  western: ["#1e0b18", "#7a3020", "#f0a050"],
  postapoc: ["#0b0704", "#2a1408", "#6e3812"],
  cyberpunk: ["#04010c", "#1a0630", "#45104e"],
  spaceopera: ["#020208", "#070a20", "#11123a"],
  gothic: ["#03020a", "#110a1e", "#2a1632"],
  urbanfantasy: ["#05030f", "#140a2a", "#2e1646"],
  steampunk: ["#0d0804", "#2a1a0c", "#6a4420"],
  pirate: ["#02050c", "#07182a", "#163a56"],
  eastasian: ["#0a0510", "#2a1022", "#6a2634"],
  superhero: ["#030614", "#0a1636", "#22346a"],
  pulp: ["#0e0904", "#3a2410", "#9a6628"],
  cozy: ["#1c1634", "#5c3c5e", "#eca078"]
};

function sky(kit: Kit) {
  const stops = SKIES[kit.visual.key];
  if (!kit.full || !stops) return;
  const [zenith, mid, horizon] = stops;
  const texture = kit.track(canvasTexture(4, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, zenith);
    g.addColorStop(0.42, mid);
    g.addColorStop(0.62, horizon);
    g.addColorStop(0.7, mid);
    g.addColorStop(1, zenith);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
  }));
  const mesh = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(kit.W * 4, kit.H * 4)), kit.track(new THREE.MeshBasicMaterial({ map: texture, fog: false, depthWrite: false })));
  mesh.position.set(0, kit.H * 0.15, kit.Z - 34);
  mesh.renderOrder = -20;
  kit.root.add(mesh);
}

/** Jagged ridge profile across the width. */
function ridge(kit: Kit, base: number, amp: number, steps: number, jag = 0.5): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const span = kit.W * 1.3;
  for (let i = 0; i <= steps; i += 1) {
    const x = -span / 2 + (span * i) / steps;
    const smooth = Math.sin(i * 0.9) * 0.5 + Math.sin(i * 0.37 + 1) * 0.5;
    out.push([x, base + amp * (0.5 + smooth * 0.35 + (kit.rand() - 0.5) * jag)]);
  }
  return out;
}

/** City skyline profile: stepped rectangles with occasional spires. */
function skyline(kit: Kit, base: number, minH: number, maxH: number, count: number, spire = 0.2): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const span = kit.W * 1.3;
  let x = -span / 2;
  const step = span / count;
  out.push([x, base]);
  for (let i = 0; i < count; i += 1) {
    const w = step * (0.6 + kit.rand() * 0.8);
    const h = base + minH + kit.rand() * (maxH - minH);
    out.push([x, h]);
    if (kit.rand() < spire) {
      out.push([x + w * 0.45, h]);
      out.push([x + w * 0.5, h + (maxH - minH) * 0.35]);
      out.push([x + w * 0.55, h]);
    }
    out.push([x + w, h]);
    x += w;
    out.push([x, base + minH * 0.4]);
  }
  out.push([x, base]);
  return out;
}

/** Expanding-ring shockwave pool. */
function ringPool(kit: Kit, count: number, color: THREE.ColorRepresentation, opts: { thickness?: number; flat?: boolean; life?: number; segments?: number } = {}) {
  const life = opts.life ?? 1.2;
  const geometry = kit.track(new THREE.RingGeometry(0.92, 1, opts.segments ?? 96));
  const rings: Array<{ mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; age: number; size: number; peak: number }> = [];
  for (let i = 0; i < count; i += 1) {
    const material = kit.track(additive(color, 0));
    const mesh = new THREE.Mesh(geometry, material);
    if (opts.flat) mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    kit.root.add(mesh);
    rings.push({ mesh, material, age: 99, size: 1, peak: 0.6 });
  }
  let cursor = 0;
  return {
    fire(x: number, y: number, z: number, size: number, peak = 0.6, tint?: THREE.Color) {
      const ring = rings[cursor];
      cursor = (cursor + 1) % rings.length;
      ring.mesh.position.set(x, y, z);
      ring.age = 0;
      ring.size = size;
      ring.peak = peak;
      if (tint) ring.material.color.copy(tint);
      ring.mesh.visible = true;
    },
    update(dt: number, envelope: number) {
      for (const ring of rings) {
        if (!ring.mesh.visible) continue;
        ring.age += dt;
        const k = ring.age / life;
        if (k >= 1) {
          ring.mesh.visible = false;
          continue;
        }
        const eased = 1 - Math.pow(1 - k, 3);
        ring.mesh.scale.setScalar(0.05 + eased * ring.size);
        ring.material.opacity = (1 - k) * (1 - k) * ring.peak * envelope;
      }
    }
  };
}

/** Ballistic spark pool (points with velocity + gravity). */
function sparkPool(kit: Kit, count: number, color: THREE.ColorRepresentation, size: number, gravity = -2.5) {
  const c = cloud(kit, count, color, size, 1);
  const vel = new Float32Array(count * 3);
  const life = new Float32Array(count);
  for (let i = 0; i < count; i += 1) c.positions[i * 3 + 1] = -999;
  let cursor = 0;
  return {
    burst(x: number, y: number, z: number, amount: number, speed: number, spread = TAU, dir = Math.PI / 2, up = 0) {
      for (let k = 0; k < amount; k += 1) {
        const i = cursor;
        cursor = (cursor + 1) % count;
        const a = dir + (kit.rand() - 0.5) * spread;
        const s = speed * (0.4 + kit.rand() * 0.8);
        c.positions[i * 3] = x;
        c.positions[i * 3 + 1] = y;
        c.positions[i * 3 + 2] = z + (kit.rand() - 0.5) * 0.6;
        vel[i * 3] = Math.cos(a) * s;
        vel[i * 3 + 1] = Math.sin(a) * s + up;
        vel[i * 3 + 2] = (kit.rand() - 0.5) * s * 0.3;
        life[i] = 0.6 + kit.rand() * 0.8;
      }
    },
    update(dt: number, envelope: number) {
      for (let i = 0; i < count; i += 1) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) {
          c.positions[i * 3 + 1] = -999;
          continue;
        }
        vel[i * 3 + 1] += gravity * dt;
        c.positions[i * 3] += vel[i * 3] * dt;
        c.positions[i * 3 + 1] += vel[i * 3 + 1] * dt;
        c.positions[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      c.attr.needsUpdate = true;
      c.material.opacity = envelope;
    }
  };
}

/** Falling/rising/drifting field with wrap-around inside the kit bounds. */
function driftField(kit: Kit, count: number, color: THREE.ColorRepresentation, size: number, opacity: number, depth = 6) {
  const c = cloud(kit, count, color, size, opacity);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    c.positions[i * 3] = (kit.rand() - 0.5) * kit.W;
    c.positions[i * 3 + 1] = (kit.rand() - 0.5) * kit.H;
    c.positions[i * 3 + 2] = kit.Z - kit.rand() * depth;
    seed[i] = kit.rand();
  }
  return {
    ...c,
    seed,
    step(dt: number, vx: number, vy: number, wobble: number, t: number) {
      const hw = kit.W / 2;
      const hh = kit.H / 2;
      for (let i = 0; i < count; i += 1) {
        const s = seed[i];
        const sp = 0.55 + s * 0.9;
        let x = c.positions[i * 3] + (vx * sp + Math.sin(t * (0.6 + s) + s * 40) * wobble) * dt;
        let y = c.positions[i * 3 + 1] + (vy * sp + Math.cos(t * (0.5 + s) + s * 17) * wobble * 0.6) * dt;
        if (x > hw) x -= kit.W;
        if (x < -hw) x += kit.W;
        if (y > hh) y -= kit.H;
        if (y < -hh) y += kit.H;
        c.positions[i * 3] = x;
        c.positions[i * 3 + 1] = y;
      }
      c.attr.needsUpdate = true;
    }
  };
}

/** Plane with per-frame vertex displacement (aurora curtains, the sea). */
function sheet(kit: Kit, w: number, h: number, sx: number, sy: number, material: THREE.Material) {
  const geometry = kit.track(new THREE.PlaneGeometry(w, h, sx, sy));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  kit.root.add(mesh);
  const base = new Float32Array((geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array);
  return { mesh, geometry, base, attr: geometry.getAttribute("position") as THREE.BufferAttribute };
}

const tmpColor = new THREE.Color();

/* ------------------------------------------------------------------ */
/* Factory                                                              */
/* ------------------------------------------------------------------ */

type Frame = (f: ThemeEnvironmentFrame) => void;
type Builder = (kit: Kit) => Frame;

const BUILDERS: Partial<Record<ThemeKey, Builder>> = {
  fantasy: buildFantasy,
  scifi: buildScifi,
  horror: buildHorror,
  noir: buildNoir,
  modern: buildModern,
  western: buildWestern,
  postapoc: buildPostapoc,
  cyberpunk: buildCyberpunk,
  spaceopera: buildSpaceopera,
  gothic: buildGothic,
  urbanfantasy: buildUrbanfantasy,
  steampunk: buildSteampunk,
  pirate: buildPirate,
  eastasian: buildEastasian,
  superhero: buildSuperhero,
  pulp: buildPulp,
  cozy: buildCozy
};

/** The themes that own an environment (everything but the neutral table). */
export const ENVIRONMENT_THEMES = Object.keys(BUILDERS) as ThemeKey[];

/**
 * Build the theme's environment into `scene`. Returns null for "none".
 * The caller owns the frame loop: call `update` once per frame with a
 * MusicPulse read, and `dispose` on teardown.
 */
export function createThemeEnvironment(scene: THREE.Scene, visual: ThemeVisual, options: ThemeEnvironmentOptions): ThemeEnvironment | null {
  const builder = BUILDERS[visual.key];
  if (!builder) return null;
  const disposables: Array<{ dispose: () => void }> = [];
  const root = new THREE.Group();
  scene.add(root);
  const kit: Kit = {
    scene,
    visual,
    W: options.width,
    H: options.height,
    Z: options.z,
    full: options.full,
    n: (count) => Math.max(1, Math.round(count * (options.full ? 1 : 0.6))),
    root,
    track: (item) => {
      disposables.push(item);
      return item;
    },
    glow: null as unknown as THREE.CanvasTexture,
    rand: mulberry32(visual.key.split("").reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7))
  };
  kit.glow = kit.track(glowTexture());
  sky(kit);
  const update = builder(kit);
  return {
    update,
    dispose: () => {
      scene.remove(root);
      for (const item of disposables) item.dispose();
    }
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   1. FANTASY — Aurora Vale
   ═══════════════════════════════════════════════════════════════════════ */
function buildFantasy(kit: Kit): Frame {
  const { W, H, Z, visual } = kit;
  const curtainTex = kit.track(canvasTexture(512, 256, (ctx) => {
    const v = ctx.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, "rgba(255,255,255,0)");
    v.addColorStop(0.18, "rgba(255,255,255,0.75)");
    v.addColorStop(0.5, "rgba(255,255,255,0.25)");
    v.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 512, 256);
    // Fold the curtain: one horizontal alpha ripple applied as a single mask
    // (per-column destination-in fills would each erase everything else).
    ctx.globalCompositeOperation = "destination-in";
    const ripple = ctx.createLinearGradient(0, 0, 512, 0);
    for (let i = 0; i <= 32; i += 1) {
      ripple.addColorStop(i / 32, `rgba(255,255,255,${(0.3 + 0.7 * Math.abs(Math.sin(i * 1.45) * Math.sin(i * 0.41 + 1))).toFixed(2)})`);
    }
    ctx.fillStyle = ripple;
    ctx.fillRect(0, 0, 512, 256);
  }));
  const curtainColors = ["#4fd8a8", visual.secondary, "#7fe0ff"];
  const curtains = curtainColors.map((color, i) => {
    const s = sheet(kit, W * 2.4, H * 0.42, 160, 1, kit.track(additive(color, 0.4, curtainTex)));
    s.mesh.position.set((i - 1) * 3, H * (0.22 + i * 0.05), Z - 6 - i * 3);
    return { ...s, seed: i * 2.1 };
  });

  if (kit.full) {
    silhouette(kit, ridge(kit, -H * 0.2, H * 0.22, 22, 0.8), -H, Z - 9, "#0a0c1c", { color: visual.secondary, opacity: 0.25 });
    // A castle on the far ridge: keep, two towers with pointed roofs.
    const c = W * 0.18;
    const b = -H * 0.06;
    silhouette(kit, [
      [c - 2.4, b], [c - 2.4, b + 1.6], [c - 2.6, b + 1.6], [c - 2.0, b + 2.6], [c - 1.4, b + 1.6], [c - 1.6, b + 1.6],
      [c - 1.6, b + 1.1], [c - 0.6, b + 1.1], [c - 0.6, b + 2.0], [c - 0.75, b + 2.0], [c, b + 3.6], [c + 0.75, b + 2.0],
      [c + 0.6, b + 2.0], [c + 0.6, b + 1.1], [c + 1.6, b + 1.1], [c + 1.6, b + 1.8], [c + 1.4, b + 1.8], [c + 1.9, b + 2.7],
      [c + 2.4, b + 1.8], [c + 2.2, b + 1.8], [c + 2.2, b]
    ], -H, Z - 8.5, "#080a17");
    silhouette(kit, ridge(kit, -H * 0.36, H * 0.12, 16, 0.6), -H, Z - 4, "#05060f", { color: "#4fd8a8", opacity: 0.18 });
  }
  const windows = kit.full ? [sprite(kit, visual.accentBright, 0.0, W * 0.18 - 2.0, -H * 0.06 + 2.0, Z - 8.4, 0.5), sprite(kit, visual.accentBright, 0, W * 0.18, -H * 0.06 + 2.6, Z - 8.4, 0.6)] : [];

  // Fireflies low, rune motes high.
  const flies = driftField(kit, kit.n(90), visual.accentBright, 0.16, 0.9, 7);
  for (let i = 0; i < flies.count; i += 1) flies.positions[i * 3 + 1] = -H * 0.45 + kit.rand() * H * 0.45;
  const runes = cloud(kit, kit.n(28), "#bfa8ff", 0.42, 0);
  const runeSeed = Array.from({ length: runes.count }, () => [kit.rand() * W - W / 2, kit.rand() * H * 0.5, Z - 3 - kit.rand() * 5, kit.rand()]);
  const runeFlare = new Float32Array(runes.count);
  const rings = ringPool(kit, 4, visual.accentBright, { life: 1.4 });
  let runeCursor = 0;

  return ({ t, dt, envelope, drive, pulse }) => {
    const surge = 0.55 + pulse.swell * 0.9 + pulse.mid * 0.4;
    for (const c of curtains) {
      for (let i = 0; i < c.attr.count; i += 1) {
        const x = c.base[i * 3];
        const y = c.base[i * 3 + 1];
        c.attr.setY(i, y + Math.sin(x * 0.32 + t * 0.45 + c.seed) * 0.6 * surge + Math.sin(x * 0.11 - t * 0.2) * 1.1);
        c.attr.setZ(i, c.base[i * 3 + 2] + Math.sin(x * 0.18 + t * 0.3 + c.seed) * 1.2);
      }
      c.attr.needsUpdate = true;
      (c.mesh.material as THREE.MeshBasicMaterial).opacity = (0.22 + 0.16 * Math.sin(t * 0.25 + c.seed) + pulse.swell * 0.35 + pulse.kick * 0.08) * envelope;
    }
    flies.step(dt, 0.15, 0.08 + pulse.kick * 1.2, 0.7 + pulse.kick * 2.2, t);
    flies.material.opacity = (0.45 + pulse.hat * 0.45 + Math.sin(t * 2.3) * 0.12) * envelope;
    flies.material.size = (0.14 + pulse.kick * 0.12) * 2.4;
    if (pulse.snareHit) {
      const i = runeCursor;
      runeCursor = (runeCursor + 1) % runes.count;
      runeFlare[i] = 1;
      rings.fire(runeSeed[i][0], runeSeed[i][1], runeSeed[i][2], 2.6, 0.5);
    }
    let lit = 0;
    for (let i = 0; i < runes.count; i += 1) {
      const s = runeSeed[i];
      runeFlare[i] = Math.max(0, runeFlare[i] - dt * 1.4);
      runes.positions[i * 3] = s[0] + Math.sin(t * 0.2 + s[3] * 9) * 0.6;
      runes.positions[i * 3 + 1] = s[1] + Math.sin(t * 0.4 + s[3] * 5) * 0.4 + runeFlare[i] * 0.6;
      runes.positions[i * 3 + 2] = s[2];
      lit = Math.max(lit, runeFlare[i]);
    }
    runes.attr.needsUpdate = true;
    runes.material.opacity = (0.18 + lit * 0.7) * envelope;
    rings.update(dt, envelope);
    windows.forEach((w, i) => { w.material.opacity = (0.5 + Math.sin(t * 3 + i) * 0.1 + pulse.kick * 0.3) * envelope; });
    kit.root.position.x = Math.sin(t * 0.03) * 0.4 * drive;
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   2. SCIFI — Hyperlane
   ═══════════════════════════════════════════════════════════════════════ */
function buildScifi(kit: Kit): Frame {
  const { W, H, Z, visual } = kit;
  const accent = new THREE.Color(visual.accent);
  const STREAKS = kit.n(220);
  const lines = segments(kit, STREAKS, accent, 0.5);
  const sd = Array.from({ length: STREAKS }, () => ({
    x: (kit.rand() - 0.5) * W * 1.6, y: (kit.rand() - 0.5) * H * 1.4, z: Z - 40 + kit.rand() * 40, v: 0.6 + kit.rand()
  }));
  let warp = 0;

  // Perspective grid floor that scrolls toward the camera.
  const GRID_X = 22;
  const GRID_Z = 16;
  const grid = segments(kit, GRID_X + GRID_Z, visual.secondary, 0.3);
  const floorY = -H * 0.42;
  const depth = 40;
  let gridScroll = 0;

  // A planet limb (full) and a scanning ring.
  if (kit.full) {
    const planetTex = kit.track(canvasTexture(256, 256, (ctx) => {
      const g = ctx.createRadialGradient(190, 70, 10, 128, 128, 128);
      g.addColorStop(0, "#1c3c8a");
      g.addColorStop(0.55, "#071330");
      g.addColorStop(0.93, "#0a2a5a");
      g.addColorStop(0.98, "#4fd8ff");
      g.addColorStop(1, "rgba(79,216,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(128, 128, 128, 0, TAU);
      ctx.fill();
    }));
    const planet = new THREE.Mesh(kit.track(new THREE.CircleGeometry(1, 64)), kit.track(new THREE.MeshBasicMaterial({ map: planetTex, transparent: true, fog: false, depthWrite: false })));
    planet.position.set(-W * 0.42, H * 0.32, Z - 30);
    planet.scale.setScalar(H * 0.32);
    planet.renderOrder = -10;
    kit.root.add(planet);
  }
  const scanners = ringPool(kit, 3, accent, { life: 1.6, segments: 6 });
  const glints = sparkPool(kit, kit.n(140), "#c8f4ff", 0.1, 0);

  return ({ t, dt, envelope, drive, pulse }) => {
    warp = Math.max(warp * Math.exp(-dt * 2.4), pulse.kick);
    const speed = (14 + pulse.level * 30 + warp * 60) * (0.6 + drive * 0.5);
    for (let i = 0; i < STREAKS; i += 1) {
      const s = sd[i];
      s.z += speed * s.v * dt;
      if (s.z > 8) {
        s.z = Z - 40 - kit.rand() * 10;
        s.x = (kit.rand() - 0.5) * W * 1.6;
        s.y = (kit.rand() - 0.5) * H * 1.4;
      }
      const len = 0.6 + s.v * (1 + warp * 6 + pulse.level * 2);
      lines.attr.setXYZ(i * 2, s.x, s.y, s.z);
      lines.attr.setXYZ(i * 2 + 1, s.x, s.y, s.z - len);
    }
    lines.attr.needsUpdate = true;
    lines.material.opacity = (0.3 + warp * 0.5 + pulse.level * 0.2) * envelope;

    gridScroll = (gridScroll + dt * (2 + pulse.level * 6 + warp * 10)) % (depth / GRID_Z);
    let k = 0;
    for (let i = 0; i < GRID_X; i += 1) {
      const x = (i / (GRID_X - 1) - 0.5) * W * 1.6;
      grid.attr.setXYZ(k * 2, x, floorY, Z + 6);
      grid.attr.setXYZ(k * 2 + 1, x, floorY, Z - depth);
      k += 1;
    }
    for (let j = 0; j < GRID_Z; j += 1) {
      const z = Z + 6 - j * (depth / GRID_Z) + gridScroll;
      grid.attr.setXYZ(k * 2, -W * 0.8, floorY, z);
      grid.attr.setXYZ(k * 2 + 1, W * 0.8, floorY, z);
      k += 1;
    }
    grid.attr.needsUpdate = true;
    grid.material.opacity = (0.16 + pulse.bass * 0.35 + warp * 0.3) * envelope;

    if (pulse.snareHit) scanners.fire((kit.rand() - 0.5) * W * 0.5, (kit.rand() - 0.2) * H * 0.4, Z - 4, 3 + pulse.snare * 3, 0.7);
    if (pulse.hatHit) glints.burst((kit.rand() - 0.5) * W, (kit.rand() - 0.5) * H * 0.7, Z - 2, 6, 2.2);
    scanners.update(dt, envelope);
    glints.update(dt, envelope * 0.9);
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   3. HORROR — The Hollow
   ═══════════════════════════════════════════════════════════════════════ */
function buildHorror(kit: Kit): Frame {
  const { W, H, Z, visual } = kit;
  if (kit.full) {
    // Dead trees: crooked trunks forking into tapered branches. Each limb is
    // a quad (WebGL lines are always 1px, which read as cracks, not wood).
    const verts: number[] = [];
    const branch = (x: number, y: number, a: number, len: number, width: number, depthLeft: number) => {
      if (depthLeft <= 0) return;
      const bend = (kit.rand() - 0.5) * 0.35;
      const x2 = x + Math.cos(a + bend) * len;
      const y2 = y + Math.sin(a + bend) * len;
      const nx = -Math.sin(a + bend);
      const ny = Math.cos(a + bend);
      const w2 = width * 0.62;
      verts.push(
        x + nx * width, y + ny * width, 0, x - nx * width, y - ny * width, 0, x2 + nx * w2, y2 + ny * w2, 0,
        x - nx * width, y - ny * width, 0, x2 - nx * w2, y2 - ny * w2, 0, x2 + nx * w2, y2 + ny * w2, 0
      );
      branch(x2, y2, a + bend + 0.45 + kit.rand() * 0.35, len * 0.72, w2, depthLeft - 1);
      branch(x2, y2, a + bend - 0.4 - kit.rand() * 0.35, len * 0.66, w2, depthLeft - 1);
    };
    for (let i = 0; i < 5; i += 1) {
      branch((i - 2) * W * 0.21 + (kit.rand() - 0.5) * 2, -H * 0.5, Math.PI / 2 + (kit.rand() - 0.5) * 0.25, H * 0.2 * (0.8 + kit.rand() * 0.4), 0.32, 6);
    }
    const treeGeo = kit.track(new THREE.BufferGeometry());
    treeGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    const trees = new THREE.Mesh(treeGeo, kit.track(new THREE.MeshBasicMaterial({ color: "#020301", fog: false, depthWrite: false, side: THREE.DoubleSide })));
    trees.position.z = Z - 7;
    trees.renderOrder = -10;
    kit.root.add(trees);
    silhouette(kit, ridge(kit, -H * 0.42, H * 0.06, 14, 0.4), -H, Z - 6.5, "#070806");
  }
  // A pale sick moon behind it all.
  const moon = sprite(kit, "#c9d79a", 0.35, W * 0.22, H * 0.3, Z - 14, H * 0.32);

  // Ground fog rolls.
  const fog = Array.from({ length: kit.n(7) }, (_, i) => sprite(kit, "#41501f", 0.25, (i - 3) * W * 0.18, -H * 0.4 + kit.rand(), Z - 2 - kit.rand() * 4, W * 0.35, H * 0.18));
  // Heartbeat: a dark red throb from below.
  const throb = sprite(kit, visual.secondary, 0, 0, -H * 0.6, Z - 3, W * 1.2, H * 0.6);
  // Watching eyes, in pairs.
  const EYES = kit.n(7);
  const eyes = Array.from({ length: EYES }, () => {
    const x = (kit.rand() - 0.5) * W * 0.85;
    const y = -H * 0.25 + kit.rand() * H * 0.35;
    const z = Z - 3 - kit.rand() * 5;
    const l = sprite(kit, "#e8ff9a", 0, x - 0.18, y, z, 0.32, 0.16);
    const r = sprite(kit, "#e8ff9a", 0, x + 0.18, y, z, 0.32, 0.16);
    return { l, r, open: 0, hold: 0 };
  });
  const spores = driftField(kit, kit.n(160), visual.accent, 0.07, 0.4, 6);
  let heart = 0;
  let flicker = 1;

  return ({ t, dt, envelope, pulse }) => {
    // Beat 1 ("lub") on the kick, a quieter "dub" a moment later.
    if (pulse.kickHit) heart = 1;
    heart = Math.max(0, heart - dt * 2.6);
    const dub = Math.max(0, Math.sin(Math.min(1, (1 - heart) * 3) * Math.PI)) * 0.35 * (heart > 0 ? 1 : 0);
    throb.material.opacity = (heart * 0.45 + dub * 0.3 + pulse.sub * 0.15) * envelope;
    throb.scale.y = H * (0.5 + heart * 0.2);
    flicker += ((Math.random() > 0.98 ? 0.2 : 1) - flicker) * Math.min(1, dt * 10);
    moon.material.opacity = (0.22 + pulse.swell * 0.2) * flicker * envelope;
    fog.forEach((f, i) => {
      f.position.x += Math.sin(t * 0.07 + i) * dt * 0.6;
      f.position.y = -H * 0.42 + Math.sin(t * 0.2 + i) * 0.3 + pulse.swell * 1.2;
      f.material.opacity = (0.18 + pulse.swell * 0.25) * envelope;
    });
    if (pulse.snareHit) {
      const closed = eyes.filter((e) => e.open <= 0.01);
      const e = closed[Math.floor(kit.rand() * closed.length)];
      if (e) e.hold = 1.2 + kit.rand() * 1.5;
    }
    for (const e of eyes) {
      e.hold -= dt;
      const target = e.hold > 0 ? 1 : 0;
      e.open += (target - e.open) * Math.min(1, dt * (target ? 9 : 3));
      const blink = Math.sin(t * 0.9 + e.l.position.x) > 0.97 ? 0.1 : 1;
      e.l.material.opacity = e.r.material.opacity = e.open * blink * 0.9 * envelope;
      e.l.scale.y = e.r.scale.y = 0.16 * e.open * blink + 0.01;
    }
    spores.step(dt, 0.05, 0.12, 0.4 + pulse.hat * 1.5, t);
    spores.material.opacity = (0.25 + pulse.hat * 0.35) * envelope * flicker;
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   4. NOIR — Rain City
   ═══════════════════════════════════════════════════════════════════════ */
function buildNoir(kit: Kit): Frame {
  const { W, H, Z, visual } = kit;
  if (kit.full) {
    silhouette(kit, skyline(kit, -H * 0.12, H * 0.08, H * 0.42, 16, 0.25), -H, Z - 10, "#0b0e14", { color: "#5f7285", opacity: 0.2 });
    silhouette(kit, skyline(kit, -H * 0.3, H * 0.05, H * 0.28, 10, 0.1), -H, Z - 5, "#06080c");
  }
  // Lit windows scattered on the far skyline.
  const winCount = kit.full ? 60 : 0;
  const wins = cloud(kit, Math.max(1, winCount), "#f2d38a", 0.16, kit.full ? 0.7 : 0);
  for (let i = 0; i < wins.count; i += 1) {
    wins.positions[i * 3] = (kit.rand() - 0.5) * W * 1.1;
    wins.positions[i * 3 + 1] = -H * 0.1 + kit.rand() * H * 0.35;
    wins.positions[i * 3 + 2] = Z - 9.9;
  }
  wins.attr.needsUpdate = true;

  const DROPS = kit.n(520);
  const rain = segments(kit, DROPS, "#9fb3cc", 0.35);
  const drop = Array.from({ length: DROPS }, () => ({ x: (kit.rand() - 0.5) * W, y: (kit.rand() - 0.5) * H, z: Z + 2 - kit.rand() * 8, v: 14 + kit.rand() * 10 }));
  // Venetian shafts.
  const shaftTex = kit.track(shaftTexture());
  const shafts = Array.from({ length: 6 }, (_, i) => {
    const m = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(0.7, H * 1.3)), kit.track(additive(visual.accent, 0.06, shaftTex)));
    m.position.set(-W * 0.35 + i * 1.1, H * 0.1, Z - 1);
    m.rotation.z = -0.5;
    kit.root.add(m);
    return m;
  });
  let sweep = 0;
  // Neon sign: a buzzing bar of light, magenta-red.
  const neon = sprite(kit, "#ff3c6a", 0.0, -W * 0.3, H * 0.05, Z - 4.5, 3.4, 0.9);
  const neonCore = sprite(kit, "#ffd0dc", 0, -W * 0.3, H * 0.05, Z - 4.45, 2.6, 0.18);
  const puddles = ringPool(kit, 8, "#9fb3cc", { flat: true, life: 1.1 });
  let buzz = 1;

  return ({ t, dt, envelope, pulse }) => {
    const density = 0.45 + pulse.level * 0.8;
    const visible = Math.floor(DROPS * Math.min(1, density));
    for (let i = 0; i < DROPS; i += 1) {
      const d = drop[i];
      if (i >= visible) {
        rain.attr.setXYZ(i * 2, 0, -999, 0);
        rain.attr.setXYZ(i * 2 + 1, 0, -999, 0);
        continue;
      }
      d.y -= d.v * dt;
      d.x -= d.v * dt * 0.14;
      if (d.y < -H / 2) {
        d.y = H / 2;
        d.x = (kit.rand() - 0.5) * W;
      }
      rain.attr.setXYZ(i * 2, d.x, d.y, d.z);
      rain.attr.setXYZ(i * 2 + 1, d.x + 0.08, d.y + 0.6, d.z);
    }
    rain.attr.needsUpdate = true;
    rain.material.opacity = (0.22 + pulse.treble * 0.3) * envelope;

    if (pulse.kickHit) {
      for (let k = 0; k < 2; k += 1) puddles.fire((kit.rand() - 0.5) * W * 0.8, -H * 0.45, Z + 1 - kit.rand() * 5, 1.2 + kit.rand(), 0.55);
    }
    puddles.update(dt, envelope);
    if (pulse.snareHit) sweep = 1;
    sweep = Math.max(0, sweep - dt * 1.2);
    shafts.forEach((m, i) => {
      m.position.x = -W * 0.35 + i * 1.1 + Math.sin(t * 0.1) * 1.5 + (1 - sweep) * 0.6;
      (m.material as THREE.MeshBasicMaterial).opacity = (0.04 + sweep * 0.14 + Math.max(0, Math.sin(t * 0.3 + i * 0.4)) * 0.04) * envelope;
    });
    buzz += ((pulse.hatHit || Math.random() > 0.993 ? 0.15 : 1) - buzz) * Math.min(1, dt * 14);
    neon.material.opacity = 0.5 * buzz * envelope;
    neonCore.material.opacity = 0.8 * buzz * envelope;
    wins.material.opacity = kit.full ? (0.4 + Math.sin(t * 0.3) * 0.05 + pulse.swell * 0.25) * envelope : 0;
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   5. MODERN — Night Ops
   ═══════════════════════════════════════════════════════════════════════ */
function buildModern(kit: Kit): Frame {
  const { W, H, Z, visual } = kit;
  if (kit.full) silhouette(kit, skyline(kit, -H * 0.25, H * 0.04, H * 0.3, 20, 0.15), -H, Z - 8, "#060b0e", { color: visual.accent, opacity: 0.15 });
  const bokehColors = [visual.accent, visual.secondary, "#ffffff", "#ff5a7a"];
  const orbs = Array.from({ length: kit.n(34) }, (_, i) => {
    const s = sprite(kit, bokehColors[i % bokehColors.length], 0.15, (kit.rand() - 0.5) * W * 1.2, -H * 0.35 + kit.rand() * H * 0.5, Z - 1 - kit.rand() * 8, 0.8 + kit.rand() * 2.4);
    return { s, v: 0.2 + kit.rand() * 0.6, seed: kit.rand() * 9, base: s.scale.x };
  });
  // Radar: a disc with a rotating sweep and blips.
  const RX = W * 0.32;
  const RY = H * 0.22;
  const radarRing = ringPool(kit, 4, visual.accent, { life: 1.4 });
  const sweepTex = kit.track(canvasTexture(256, 256, (ctx) => {
    for (let a = 0; a < 60; a += 1) {
      ctx.fillStyle = `rgba(255,255,255,${(0.6 * (1 - a / 60)).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(128, 128);
      ctx.arc(128, 128, 128, -a * 0.012, -(a + 1) * 0.012, true);
      ctx.fill();
    }
  }));
  const sweepMesh = new THREE.Mesh(kit.track(new THREE.CircleGeometry(2.2, 48)), kit.track(additive(visual.accent, 0.4, sweepTex)));
  sweepMesh.position.set(RX, RY, Z - 3);
  kit.root.add(sweepMesh);
  const radarBase = new THREE.Mesh(kit.track(new THREE.RingGeometry(2.15, 2.2, 64)), kit.track(additive(visual.accent, 0.35)));
  radarBase.position.copy(sweepMesh.position);
  kit.root.add(radarBase);
  const blips = cloud(kit, 8, visual.secondary, 0.3, 0.9);
  const blipLife = new Float32Array(8);
  let blipCursor = 0;
  // Laser scan line across the frame.
  const laser = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(W * 1.4, 0.05)), kit.track(additive("#ff3c3c", 0)));
  laser.position.z = Z - 1;
  kit.root.add(laser);
  let laserT = 1;
  // Searchlight cone.
  const shaftTex = kit.track(shaftTexture());
  const search = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(3, H * 1.4)), kit.track(additive("#dff6ff", 0.08, shaftTex)));
  search.position.set(-W * 0.2, -H * 0.1, Z - 6);
  kit.root.add(search);

  return ({ t, dt, envelope, pulse }) => {
    for (const o of orbs) {
      o.s.position.x += dt * o.v;
      if (o.s.position.x > W * 0.65) o.s.position.x = -W * 0.65;
      o.s.material.opacity = (0.08 + 0.06 * Math.sin(t * 0.5 + o.seed) + pulse.hat * 0.12) * envelope;
      o.s.scale.setScalar(o.base * (1 + pulse.kick * 0.15));
    }
    sweepMesh.rotation.z = -t * 1.6;
    (sweepMesh.material as THREE.MeshBasicMaterial).opacity = (0.25 + pulse.level * 0.3) * envelope;
    (radarBase.material as THREE.MeshBasicMaterial).opacity = 0.3 * envelope;
    if (pulse.kickHit) {
      radarRing.fire(RX, RY, Z - 3, 2.2, 0.6);
      const i = blipCursor;
      blipCursor = (blipCursor + 1) % 8;
      const a = -t * 1.6 + 0.2;
      const r = 0.5 + kit.rand() * 1.5;
      blips.positions[i * 3] = RX + Math.cos(a) * r;
      blips.positions[i * 3 + 1] = RY + Math.sin(a) * r;
      blips.positions[i * 3 + 2] = Z - 2.9;
      blipLife[i] = 1;
    }
    for (let i = 0; i < 8; i += 1) {
      blipLife[i] = Math.max(0, blipLife[i] - dt * 0.6);
      if (blipLife[i] <= 0) blips.positions[i * 3 + 1] = -999;
    }
    blips.attr.needsUpdate = true;
    radarRing.update(dt, envelope);
    if (pulse.snareHit && laserT >= 1) laserT = 0;
    laserT = Math.min(1, laserT + dt * 1.4);
    laser.position.y = H * 0.4 - laserT * H * 0.8;
    (laser.material as THREE.MeshBasicMaterial).opacity = (laserT < 1 ? Math.sin(laserT * Math.PI) * 0.6 : 0) * envelope;
    search.rotation.z = Math.sin(t * 0.25) * 0.5;
    (search.material as THREE.MeshBasicMaterial).opacity = (0.05 + pulse.swell * 0.12) * envelope;
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   6. WESTERN — High Noon
   ═══════════════════════════════════════════════════════════════════════ */
function buildWestern(kit: Kit): Frame {
  const { W, H, Z, visual } = kit;
  const sun = sprite(kit, "#ffd9a0", 0.7, W * 0.05, -H * 0.12, Z - 22, H * 0.9);
  const sunCore = sprite(kit, "#fff2d6", 0.8, W * 0.05, -H * 0.12, Z - 21.9, H * 0.22);
  const corona = ringPool(kit, 3, "#ffd9a0", { life: 1.6 });
  if (kit.full) {
    // Mesas: flat-topped buttes.
    const mesa = (cx: number, w: number, h: number, z: number, color: string) => silhouette(kit, [
      [cx - w * 0.7, -H * 0.2], [cx - w * 0.45, -H * 0.2 + h], [cx + w * 0.45, -H * 0.2 + h], [cx + w * 0.7, -H * 0.2]
    ], -H, z, color);
    mesa(-W * 0.3, W * 0.22, H * 0.22, Z - 15, "#3a1a14");
    mesa(W * 0.34, W * 0.16, H * 0.3, Z - 14, "#331611");
    silhouette(kit, ridge(kit, -H * 0.3, H * 0.06, 12, 0.3), -H, Z - 9, "#24100c", { color: visual.accent, opacity: 0.2 });
    // A saguaro.
    const sx = -W * 0.14;
    const sb = -H * 0.32;
    silhouette(kit, [
      [sx - 0.25, sb], [sx - 0.25, sb + 1.5], [sx - 0.95, sb + 1.7], [sx - 0.95, sb + 2.6], [sx - 0.7, sb + 2.6], [sx - 0.7, sb + 1.95],
      [sx - 0.25, sb + 1.85], [sx - 0.25, sb + 3.6], [sx, sb + 3.8], [sx + 0.25, sb + 3.6], [sx + 0.25, sb + 2.3], [sx + 0.7, sb + 2.5],
      [sx + 0.7, sb + 3.1], [sx + 0.95, sb + 3.1], [sx + 0.95, sb + 2.2], [sx + 0.25, sb + 1.9], [sx + 0.25, sb]
    ], -H, Z - 6, "#160906");
  }
  const haze = sprite(kit, visual.secondary, 0.3, 0, -H * 0.3, Z - 10, W * 1.6, H * 0.4);
  // Wind-blown dust streaks.
  const streakTex = kit.track(streakTexture());
  const gusts = Array.from({ length: kit.n(26) }, () => {
    const m = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(4 + kit.rand() * 4, 0.12)), kit.track(additive("#e8b67a", 0, streakTex)));
    m.position.set((kit.rand() - 0.5) * W, -H * 0.45 + kit.rand() * H * 0.35, Z - kit.rand() * 6);
    kit.root.add(m);
    return { m, v: 6 + kit.rand() * 6, life: 0 };
  });
  const dust = driftField(kit, kit.n(180), "#e8c08a", 0.06, 0.5, 6);
  // Circling hawks.
  const hawks = segments(kit, 6, "#1a0c08", 1);
  hawks.material.blending = THREE.NormalBlending;

  return ({ t, dt, envelope, pulse }) => {
    sun.material.opacity = (0.5 + pulse.swell * 0.25 + Math.sin(t * 0.17) * 0.05) * envelope;
    sun.scale.setScalar(H * (0.9 + pulse.bass * 0.08));
    sunCore.material.opacity = (0.75 + pulse.snare * 0.25) * envelope;
    if (pulse.snareHit) corona.fire(sun.position.x, sun.position.y, Z - 21.8, H * 0.45, 0.35);
    corona.update(dt, envelope);
    haze.material.opacity = (0.22 + pulse.swell * 0.2 + Math.sin(t * 0.13) * 0.05) * envelope;
    haze.position.y = -H * 0.3 + Math.sin(t * 2.1) * 0.08 * (1 + pulse.hat * 3);
    if (pulse.kickHit) {
      let fired = 0;
      for (const g of gusts) {
        if (g.life <= 0 && fired < 4) {
          g.life = 1;
          g.m.position.x = -W * 0.6 - kit.rand() * 4;
          g.m.position.y = -H * 0.45 + kit.rand() * H * 0.35;
          fired += 1;
        }
      }
    }
    for (const g of gusts) {
      if (g.life <= 0) {
        (g.m.material as THREE.MeshBasicMaterial).opacity = 0;
        continue;
      }
      g.life -= dt * 0.5;
      g.m.position.x += g.v * dt * 2;
      (g.m.material as THREE.MeshBasicMaterial).opacity = Math.sin(clamp01(g.life) * Math.PI) * 0.35 * envelope;
    }
    dust.step(dt, 1.5 + pulse.kick * 5, 0.05, 0.3, t);
    dust.material.opacity = (0.3 + pulse.hat * 0.3) * envelope;
    for (let i = 0; i < 3; i += 1) {
      const a = t * (0.25 + i * 0.07) + i * 2;
      const cx = W * (0.1 + i * 0.12) + Math.cos(a) * 3;
      const cy = H * (0.25 + i * 0.04) + Math.sin(a) * 0.8;
      const flap = 0.25 + Math.sin(t * 6 + i) * 0.15;
      hawks.attr.setXYZ(i * 4, cx - 0.5, cy + flap, Z - 8);
      hawks.attr.setXYZ(i * 4 + 1, cx, cy, Z - 8);
      hawks.attr.setXYZ(i * 4 + 2, cx, cy, Z - 8);
      hawks.attr.setXYZ(i * 4 + 3, cx + 0.5, cy + flap, Z - 8);
    }
    hawks.attr.needsUpdate = true;
    hawks.material.opacity = kit.full ? 0.9 * envelope : 0;
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   7. POSTAPOC — Ashfall
   ═══════════════════════════════════════════════════════════════════════ */
function buildPostapoc(kit: Kit): Frame {
  const { W, H, Z, visual } = kit;
  if (kit.full) {
    // Broken skyline: buildings with sheared tops.
    const p = skyline(kit, -H * 0.18, H * 0.05, H * 0.36, 13, 0).map(([x, y], i) => [x, y - (i % 3 === 1 ? kit.rand() * H * 0.1 : 0)] as [number, number]);
    silhouette(kit, p, -H, Z - 11, "#16100a", { color: visual.accent, opacity: 0.18 });
    silhouette(kit, ridge(kit, -H * 0.36, H * 0.08, 18, 0.9), -H, Z - 5, "#0b0805");
  }
  const glowSky = sprite(kit, visual.accent, 0.3, 0, -H * 0.25, Z - 14, W * 1.4, H * 0.5);
  // Smoke columns.
  const smoke = Array.from({ length: kit.n(10) }, (_, i) => {
    const s = sprite(kit, "#5a4a3a", 0.2, (i % 3 - 1) * W * 0.3, -H * 0.2, Z - 9, 3, 3);
    return { s, phase: kit.rand(), col: i % 3 };
  });
  smoke.forEach((s) => (s.s.material.blending = THREE.NormalBlending));
  const ash = driftField(kit, kit.n(380), "#c9b8a0", 0.07, 0.6, 8);
  const bolt = segments(kit, 12, visual.secondary, 0);
  let boltLife = 0;
  const flashSky = sprite(kit, visual.secondary, 0, 0, H * 0.2, Z - 13, W * 1.4, H * 0.8);
  const shocks = ringPool(kit, 3, visual.accentBright, { flat: true, life: 1.4 });
  const geiger = sparkPool(kit, kit.n(90), visual.secondary, 0.09, -0.5);
  let gutter = 1;

  const strike = () => {
    let x = (kit.rand() - 0.5) * W * 0.7;
    let y = H * 0.5;
    for (let i = 0; i < 12; i += 1) {
      const nx = x + (kit.rand() - 0.5) * 1.8;
      const ny = y - H * 0.06 - kit.rand() * H * 0.04;
      bolt.attr.setXYZ(i * 2, x, y, Z - 10);
      bolt.attr.setXYZ(i * 2 + 1, nx, ny, Z - 10);
      x = nx;
      y = ny;
    }
    bolt.attr.needsUpdate = true;
    boltLife = 1;
  };

  return ({ t, dt, envelope, pulse }) => {
    gutter += ((Math.random() > 0.985 ? 0.4 : 1) - gutter) * Math.min(1, dt * 8);
    glowSky.material.opacity = (0.22 + pulse.swell * 0.25 + pulse.sub * 0.1) * gutter * envelope;
    for (const s of smoke) {
      s.phase = (s.phase + dt * 0.05) % 1;
      s.s.position.y = -H * 0.2 + s.phase * H * 0.7;
      s.s.position.x = (s.col - 1) * W * 0.3 + Math.sin(s.phase * 6) * 0.8 + s.phase * 2;
      s.s.scale.setScalar(2 + s.phase * 7);
      s.s.material.opacity = Math.sin(s.phase * Math.PI) * 0.22 * envelope;
    }
    ash.step(dt, 0.4 + pulse.kick * 2, -0.7 - pulse.level * 0.8, 0.5 + pulse.kick * 1.5, t);
    ash.material.opacity = (0.4 + pulse.level * 0.3) * envelope;
    if (pulse.snareHit && pulse.snare > 0.5 && boltLife <= 0.2) strike();
    boltLife = Math.max(0, boltLife - dt * 3);
    bolt.material.opacity = (boltLife > 0.6 ? 1 : boltLife * 1.4) * envelope;
    flashSky.material.opacity = boltLife * 0.25 * envelope;
    if (pulse.kickHit && pulse.kick > 0.8) shocks.fire((kit.rand() - 0.5) * W * 0.4, -H * 0.42, Z - 2, W * 0.4, 0.4);
    shocks.update(dt, envelope);
    if (pulse.hatHit) geiger.burst((kit.rand() - 0.5) * W * 0.9, -H * 0.3 + kit.rand() * H * 0.5, Z - 2, 3, 1.2);
    geiger.update(dt, envelope);
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   8. CYBERPUNK — Neon Grid (the skyline IS an equalizer)
   ═══════════════════════════════════════════════════════════════════════ */
function buildCyberpunk(kit: Kit): Frame {
  const { W, H, Z, visual } = kit;
  const magenta = new THREE.Color(visual.accent);
  const cyan = new THREE.Color(visual.secondary);
  // Towers: unit boxes scaled per frame by spectrum bands.
  const TOWERS = kit.full ? 26 : 14;
  const boxGeo = kit.track(new THREE.BoxGeometry(1, 1, 1));
  boxGeo.translate(0, 0.5, 0);
  const edgeGeo = kit.track(new THREE.EdgesGeometry(boxGeo));
  const bodyMat = kit.track(new THREE.MeshBasicMaterial({ color: "#07040f", fog: false, transparent: !kit.full, opacity: kit.full ? 1 : 0 , depthWrite: kit.full }));
  const towers = Array.from({ length: TOWERS }, (_, i) => {
    const g = new THREE.Group();
    const w = 0.8 + kit.rand() * 1.4;
    const x = (i / (TOWERS - 1) - 0.5) * W * 1.2 + (kit.rand() - 0.5);
    const z = Z - 9 - kit.rand() * 6;
    const body = new THREE.Mesh(boxGeo, bodyMat);
    const edgeMat = kit.track(new THREE.LineBasicMaterial({ color: i % 3 === 0 ? cyan : magenta, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    g.add(body, edges);
    g.position.set(x, -H * 0.42, z);
    g.scale.set(w, 1, w);
    kit.root.add(g);
    return { g, edgeMat, base: H * (0.15 + kit.rand() * 0.35), band: i % 7, h: 1 };
  });
  // Floor grid pulse.
  const grid = segments(kit, 40, magenta, 0.3);
  for (let i = 0; i < 20; i += 1) {
    const x = (i / 19 - 0.5) * W * 1.6;
    grid.attr.setXYZ(i * 2, x, -H * 0.42, Z + 4);
    grid.attr.setXYZ(i * 2 + 1, x * 0.4, -H * 0.42, Z - 24);
  }
  for (let j = 0; j < 20; j += 1) {
    const z = Z + 4 - Math.pow(j / 19, 1.6) * 28;
    grid.attr.setXYZ((20 + j) * 2, -W * 0.8, -H * 0.42, z);
    grid.attr.setXYZ((20 + j) * 2 + 1, W * 0.8, -H * 0.42, z);
  }
  grid.attr.needsUpdate = true;
  // Holo rain: vertical code streaks in both neons.
  const RAIN = kit.n(240);
  const rain = cloud(kit, RAIN, 0xffffff, 0.09, 0.8, true);
  const rv = new Float32Array(RAIN);
  for (let i = 0; i < RAIN; i += 1) {
    rain.positions[i * 3] = (kit.rand() - 0.5) * W;
    rain.positions[i * 3 + 1] = (kit.rand() - 0.5) * H;
    rain.positions[i * 3 + 2] = Z - kit.rand() * 8;
    rv[i] = 3 + kit.rand() * 5;
    tmpColor.copy(i % 2 ? magenta : cyan);
    rain.colors![i * 3] = tmpColor.r;
    rain.colors![i * 3 + 1] = tmpColor.g;
    rain.colors![i * 3 + 2] = tmpColor.b;
  }
  rain.geometry.getAttribute("color").needsUpdate = true;
  // Glitch slices: thin full-width bars that jolt sideways on the snare.
  const slices = Array.from({ length: 5 }, (_, i) => {
    const m = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(W * 2, 0.05 + kit.rand() * 0.22)), kit.track(additive(i % 2 ? cyan : magenta, 0)));
    m.position.z = Z + 1;
    kit.root.add(m);
    return { m, life: 0 };
  });
  const bands: Array<keyof MusicPulse> = ["sub", "bass", "lowMid", "mid", "highMid", "treble", "air"];

  return ({ t, dt, envelope, pulse }) => {
    for (const tw of towers) {
      const v = pulse[bands[tw.band]] as number;
      const target = tw.base * (0.7 + v * 1.6);
      tw.h += (target - tw.h) * Math.min(1, dt * 10);
      tw.g.scale.y = tw.h;
      tw.edgeMat.opacity = (0.3 + v * 0.8) * envelope;
    }
    grid.material.opacity = (0.15 + pulse.kick * 0.6) * envelope;
    grid.material.color.copy(magenta).lerp(cyan, pulse.brightness);
    for (let i = 0; i < RAIN; i += 1) {
      let y = rain.positions[i * 3 + 1] - rv[i] * dt * (1 + pulse.hat * 1.5);
      if (y < -H / 2) y += H;
      rain.positions[i * 3 + 1] = y;
    }
    rain.attr.needsUpdate = true;
    rain.material.opacity = (0.4 + pulse.hat * 0.4) * envelope;
    if (pulse.snareHit) {
      for (const s of slices) {
        if (kit.rand() < 0.6) {
          s.life = 0.18 + kit.rand() * 0.15;
          s.m.position.y = (kit.rand() - 0.5) * H;
          s.m.position.x = (kit.rand() - 0.5) * 2;
        }
      }
    }
    for (const s of slices) {
      s.life = Math.max(0, s.life - dt);
      (s.m.material as THREE.MeshBasicMaterial).opacity = (s.life > 0 ? 0.22 : 0) * envelope;
      if (s.life > 0) s.m.position.x += (kit.rand() - 0.5) * 0.8;
    }
    kit.root.position.x = Math.sin(t * 0.05) * 0.5;
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   9. SPACE OPERA — Fleet Nebula
   ═══════════════════════════════════════════════════════════════════════ */
function buildSpaceopera(kit: Kit): Frame {
  const { W, H, Z, visual } = kit;
  const nebulae = [
    sprite(kit, visual.secondary, 0.35, -W * 0.3, H * 0.15, Z - 26, W * 0.9, H * 0.9),
    sprite(kit, "#ff6a9a", 0.22, W * 0.25, H * 0.25, Z - 27, W * 0.7, H * 0.7),
    sprite(kit, visual.accent, 0.18, W * 0.05, -H * 0.1, Z - 25, W * 0.6, H * 0.5)
  ];
  if (kit.full) {
    // Ringed gas giant.
    const planetTex = kit.track(canvasTexture(256, 256, (ctx) => {
      const g = ctx.createRadialGradient(100, 90, 10, 128, 128, 128);
      g.addColorStop(0, "#f2c48a");
      g.addColorStop(0.6, "#8a4a2a");
      g.addColorStop(1, "#1a0c08");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(128, 128, 126, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-atop";
      for (let y = 0; y < 256; y += 9) {
        ctx.fillStyle = `rgba(255,220,180,${(0.05 + 0.08 * Math.abs(Math.sin(y * 0.3))).toFixed(2)})`;
        ctx.fillRect(0, y, 256, 4);
      }
    }));
    const planet = new THREE.Mesh(kit.track(new THREE.CircleGeometry(1, 64)), kit.track(new THREE.MeshBasicMaterial({ map: planetTex, transparent: true, fog: false, depthWrite: false })));
    planet.position.set(-W * 0.3, -H * 0.24, Z - 20);
    planet.scale.setScalar(H * 0.2);
    planet.renderOrder = -9;
    kit.root.add(planet);
    const ring = new THREE.Mesh(kit.track(new THREE.RingGeometry(1.35, 2.1, 96)), kit.track(additive("#ffd9a8", 0.25)));
    ring.position.copy(planet.position);
    ring.scale.setScalar(H * 0.2);
    ring.rotation.set(1.25, 0.2, 0.3);
    kit.root.add(ring);
  }
  const stars = cloud(kit, kit.n(500), 0xffffff, 0.08, 0.8);
  for (let i = 0; i < stars.count; i += 1) {
    stars.positions[i * 3] = (kit.rand() - 0.5) * W * 1.5;
    stars.positions[i * 3 + 1] = (kit.rand() - 0.5) * H * 1.4;
    stars.positions[i * 3 + 2] = Z - 15 - kit.rand() * 15;
  }
  stars.attr.needsUpdate = true;
  // Capital ships: wedge silhouettes with engine glows, crossing slowly.
  const shipShape = new THREE.Shape();
  shipShape.moveTo(1.6, 0);
  shipShape.lineTo(-1.2, 0.42);
  shipShape.lineTo(-1.0, 0.1);
  shipShape.lineTo(-1.3, 0);
  shipShape.lineTo(-1.0, -0.12);
  shipShape.lineTo(-1.2, -0.38);
  shipShape.closePath();
  const shipGeo = kit.track(new THREE.ShapeGeometry(shipShape));
  const shipMat = kit.track(new THREE.MeshBasicMaterial({ color: "#0c0e1c", fog: false, transparent: true, opacity: kit.full ? 1 : 0.85, depthWrite: false }));
  const ships = Array.from({ length: kit.full ? 5 : 3 }, (_, i) => {
    const mesh = new THREE.Mesh(shipGeo, shipMat);
    const scale = 0.8 + kit.rand() * 1.6;
    mesh.scale.setScalar(scale);
    mesh.position.set(-W * 0.6 + kit.rand() * W * 1.2, -H * 0.1 + (i - 2) * H * 0.12, Z - 6 - i * 2);
    kit.root.add(mesh);
    const engine = sprite(kit, visual.secondary, 0.6, 0, 0, mesh.position.z + 0.01, scale * 0.9, scale * 0.5);
    return { mesh, engine, scale, v: 0.4 + kit.rand() * 0.5 };
  });
  // Laser volleys.
  const BOLTS = 16;
  const bolts = segments(kit, BOLTS, "#ff4f6a", 0.9);
  const bd = Array.from({ length: BOLTS }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0 }));
  let boltCursor = 0;

  return ({ t, dt, envelope, pulse }) => {
    nebulae.forEach((n, i) => {
      n.material.opacity = (0.16 + 0.06 * Math.sin(t * 0.1 + i * 2) + pulse.swell * 0.3) * envelope;
      n.material.rotation = t * 0.01 * (i % 2 ? 1 : -1);
    });
    stars.material.opacity = (0.5 + pulse.hat * 0.5) * envelope;
    stars.material.size = (0.07 + pulse.hat * 0.05) * 2.4;
    for (const s of ships) {
      s.mesh.position.x += s.v * dt;
      if (s.mesh.position.x > W * 0.75) s.mesh.position.x = -W * 0.75;
      s.engine.position.set(s.mesh.position.x - 1.25 * s.scale, s.mesh.position.y, s.mesh.position.z + 0.01);
      s.engine.material.opacity = (0.35 + pulse.kick * 0.65) * envelope;
      s.engine.scale.set(s.scale * (0.7 + pulse.kick * 0.9), s.scale * 0.45, 1);
    }
    if (pulse.snareHit) {
      const from = ships[Math.floor(kit.rand() * ships.length)];
      for (let k = 0; k < 3; k += 1) {
        const b = bd[boltCursor];
        boltCursor = (boltCursor + 1) % BOLTS;
        b.life = 1;
        b.x = from.mesh.position.x + 1.6 * from.scale;
        b.y = from.mesh.position.y + (k - 1) * 0.15;
        b.z = from.mesh.position.z;
        b.vx = 22;
        b.vy = (kit.rand() - 0.5) * 2;
      }
    }
    for (let i = 0; i < BOLTS; i += 1) {
      const b = bd[i];
      if (b.life <= 0) {
        bolts.attr.setXYZ(i * 2, 0, -999, 0);
        bolts.attr.setXYZ(i * 2 + 1, 0, -999, 0);
        continue;
      }
      b.life -= dt * 1.2;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      bolts.attr.setXYZ(i * 2, b.x, b.y, b.z);
      bolts.attr.setXYZ(i * 2 + 1, b.x - 1.2, b.y - b.vy * 0.05, b.z);
    }
    bolts.attr.needsUpdate = true;
    bolts.material.opacity = 0.9 * envelope;
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   10. GOTHIC — Cathedral Night
   ═══════════════════════════════════════════════════════════════════════ */
function buildGothic(kit: Kit): Frame {
  const { W, H, Z, visual } = kit;
  const moon = sprite(kit, "#e8e4f2", 0.55, -W * 0.28, H * 0.28, Z - 20, H * 0.32);
  const moonHalo = sprite(kit, visual.secondary, 0.25, -W * 0.28, H * 0.28, Z - 20.1, H * 0.9);
  // Rose window: radial tracery, glowing from within.
  const roseTex = kit.track(canvasTexture(512, 512, (ctx) => {
    ctx.translate(256, 256);
    const petals = 12;
    for (let ring = 3; ring >= 1; ring -= 1) {
      for (let i = 0; i < petals; i += 1) {
        ctx.save();
        ctx.rotate((i / petals) * TAU + ring * 0.13);
        const hue = [0, 220, 40][ring - 1];
        ctx.fillStyle = `hsla(${(hue + i * 25) % 360},80%,55%,0.85)`;
        ctx.beginPath();
        ctx.ellipse(0, -ring * 70, 26, 48, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.fillStyle = "rgba(255,230,190,0.9)";
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.lineWidth = 7;
    for (let r = 40; r <= 250; r += 70) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
    }
    for (let i = 0; i < 24; i += 1) {
      ctx.save();
      ctx.rotate((i / 24) * TAU);
      ctx.beginPath();
      ctx.moveTo(0, 40);
      ctx.lineTo(0, 250);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalCompositeOperation = "destination-in";
    const g = ctx.createRadialGradient(0, 0, 200, 0, 0, 256);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-256, -256, 512, 512);
  }));
  const rose = new THREE.Mesh(kit.track(new THREE.CircleGeometry(1, 64)), kit.track(additive(0xffffff, 0.3, roseTex)));
  const roseX = W * 0.2;
  const roseY = -H * 0.02;
  rose.position.set(roseX, roseY, Z - 10);
  rose.scale.setScalar(H * 0.11);
  kit.root.add(rose);
  if (kit.full) {
    // Cathedral: twin spires flanking the rose, a nave below.
    const cx = roseX;
    const s = H * 0.11;
    const base = -H * 0.5;
    silhouette(kit, [
      [cx - s * 2.6, base], [cx - s * 2.6, roseY + s * 0.4], [cx - s * 2.2, roseY + s * 2.6], [cx - s * 1.8, roseY + s * 0.4],
      [cx - s * 1.8, roseY - s * 0.2], [cx - s * 1.2, roseY - s * 0.2], [cx - s * 1.2, roseY + s * 1.3], [cx, roseY + s * 2.0],
      [cx + s * 1.2, roseY + s * 1.3], [cx + s * 1.2, roseY - s * 0.2], [cx + s * 1.8, roseY - s * 0.2], [cx + s * 1.8, roseY + s * 0.4],
      [cx + s * 2.2, roseY + s * 2.6], [cx + s * 2.6, roseY + s * 0.4], [cx + s * 2.6, base]
    ], -H, Z - 10.2, "#040309", { color: visual.secondary, opacity: 0.22 });
    silhouette(kit, ridge(kit, -H * 0.38, H * 0.05, 20, 0.2).map(([x, y], i) => [x, y + (i % 4 === 0 ? H * 0.08 : 0)] as [number, number]), -H, Z - 4, "#05040a");
  }
  // Bats.
  const BATS = kit.n(22);
  const bats = segments(kit, BATS * 2, "#0a0a12", 1);
  bats.material.blending = THREE.NormalBlending;
  const bd = Array.from({ length: BATS }, () => ({ a: kit.rand() * TAU, r: 2 + kit.rand() * 5, y: H * 0.1 + kit.rand() * H * 0.3, v: 0.3 + kit.rand() * 0.4, scatter: 0, phase: kit.rand() * 9 }));
  const candles = driftField(kit, kit.n(60), "#ffb070", 0.14, 0.7, 5);
  const bells = ringPool(kit, 3, visual.accentBright, { life: 2.2 });

  return ({ t, dt, envelope, pulse }) => {
    moon.material.opacity = (0.45 + pulse.swell * 0.15) * envelope;
    moonHalo.material.opacity = (0.15 + pulse.swell * 0.2) * envelope;
    (rose.material as THREE.MeshBasicMaterial).opacity = (0.25 + pulse.swell * 0.5 + pulse.mid * 0.2) * envelope;
    rose.rotation.z = t * 0.02;
    if (pulse.kickHit) for (const b of bd) b.scatter = Math.min(1.5, b.scatter + 0.6 + kit.rand() * 0.4);
    for (let i = 0; i < BATS; i += 1) {
      const b = bd[i];
      b.scatter = Math.max(0, b.scatter - dt * 0.8);
      b.a += dt * b.v * (1 + b.scatter * 3);
      const r = b.r * (1 + b.scatter * 0.8);
      const x = roseX + Math.cos(b.a) * r * 1.6;
      const y = b.y + Math.sin(b.a * 1.3) * r * 0.25 + b.scatter * 1.2;
      const flap = Math.sin(t * 14 + b.phase) * 0.15;
      const z = Z - 7;
      bats.attr.setXYZ(i * 4, x - 0.3, y + flap, z);
      bats.attr.setXYZ(i * 4 + 1, x, y, z);
      bats.attr.setXYZ(i * 4 + 2, x, y, z);
      bats.attr.setXYZ(i * 4 + 3, x + 0.3, y + flap, z);
    }
    bats.attr.needsUpdate = true;
    bats.material.opacity = (kit.full ? 0.95 : 0.6) * envelope;
    candles.step(dt, 0.02, 0.18, 0.15, t);
    candles.material.opacity = (0.45 + pulse.hat * 0.3 + (Math.random() - 0.5) * 0.15) * envelope;
    if (pulse.snareHit && pulse.snare > 0.6) bells.fire(roseX, roseY, Z - 9.9, H * 0.4, 0.35);
    bells.update(dt, envelope);
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   11. URBAN FANTASY — Hidden Ley
   ═══════════════════════════════════════════════════════════════════════ */
function buildUrbanfantasy(kit: Kit): Frame {
  const { W, H, Z, visual } = kit;
  if (kit.full) silhouette(kit, skyline(kit, -H * 0.2, H * 0.06, H * 0.34, 18, 0.2), -H, Z - 9, "#0b0716", { color: visual.accent, opacity: 0.22 });
  // Ley lines: glowing curves threading the city, with a travelling pulse.
  const LINES = 4;
  const PTS = 60;
  const ley = Array.from({ length: LINES }, (_, li) => {
    const seg = segments(kit, PTS - 1, li % 2 ? visual.secondary : visual.accent, 0.5);
    const y0 = -H * 0.35 + li * H * 0.12;
    const pts: number[] = [];
    for (let i = 0; i < PTS; i += 1) {
      const x = (i / (PTS - 1) - 0.5) * W * 1.3;
      pts.push(x, y0 + Math.sin(i * 0.25 + li * 1.7) * H * 0.06 + Math.sin(i * 0.07 + li) * H * 0.05, Z - 4 - li * 1.2);
    }
    for (let i = 0; i < PTS - 1; i += 1) {
      seg.attr.setXYZ(i * 2, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      seg.attr.setXYZ(i * 2 + 1, pts[i * 3 + 3], pts[i * 3 + 4], pts[i * 3 + 5]);
    }
    seg.attr.needsUpdate = true;
    const head = sprite(kit, visual.accentBright, 0, 0, 0, Z - 4 - li * 1.2, 1.2);
    return { seg, pts, head, pos: -1 };
  });
  // Floating sigils: concentric rings with spokes, rotating.
  const sigilTex = kit.track(canvasTexture(256, 256, (ctx) => {
    ctx.translate(128, 128);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    for (const r of [118, 92, 50]) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
    }
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU;
      const b = ((i + 2) / 6) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 92, Math.sin(a) * 92);
      ctx.lineTo(Math.cos(b) * 92, Math.sin(b) * 92);
      ctx.stroke();
    }
    ctx.font = "18px serif";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (let i = 0; i < 12; i += 1) {
      ctx.save();
      ctx.rotate((i / 12) * TAU);
      ctx.fillText("ᛟᚱᛉᛊᚦᛗᛞᚹᛏᛒᚨᛚ"[i], -5, -100);
      ctx.restore();
    }
  }));
  const sigils = Array.from({ length: kit.n(4) }, (_, i) => {
    const m = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(1, 1)), kit.track(additive(i % 2 ? visual.secondary : visual.accent, 0.2, sigilTex)));
    m.position.set((i - 1.5) * W * 0.25, H * 0.15 + kit.rand() * H * 0.15, Z - 6);
    m.scale.setScalar(2 + kit.rand() * 1.5);
    kit.root.add(m);
    return { m, flare: 0, base: m.scale.x, spin: (kit.rand() - 0.5) * 0.6 };
  });
  const pixies = sparkPool(kit, kit.n(160), visual.accentBright, 0.1, 0.4);
  const motes = driftField(kit, kit.n(120), visual.accent, 0.06, 0.4, 6);

  return ({ t, dt, envelope, pulse }) => {
    if (pulse.kickHit) for (const l of ley) if (l.pos < 0 || l.pos > 0.7) l.pos = 0;
    for (const l of ley) {
      l.seg.material.opacity = (0.2 + pulse.swell * 0.35 + pulse.bass * 0.15) * envelope;
      if (l.pos >= 0) {
        l.pos += dt * 0.7;
        if (l.pos > 1) l.pos = -1;
      }
      if (l.pos >= 0) {
        const i = Math.min(PTS - 1, Math.floor(l.pos * (PTS - 1)));
        l.head.position.set(l.pts[i * 3], l.pts[i * 3 + 1], l.pts[i * 3 + 2]);
        l.head.material.opacity = Math.sin(l.pos * Math.PI) * 0.9 * envelope;
      } else l.head.material.opacity = 0;
    }
    if (pulse.snareHit) {
      const s = sigils[Math.floor(kit.rand() * sigils.length)];
      s.flare = 1;
      pixies.burst(s.m.position.x, s.m.position.y, s.m.position.z, 14, 2.4);
    }
    for (const s of sigils) {
      s.flare = Math.max(0, s.flare - dt * 1.5);
      s.m.rotation.z += dt * (s.spin + s.flare * 2);
      s.m.scale.setScalar(s.base * (1 + s.flare * 0.25));
      (s.m.material as THREE.MeshBasicMaterial).opacity = (0.15 + s.flare * 0.7 + pulse.swell * 0.15) * envelope;
    }
    if (pulse.hatHit) pixies.burst((kit.rand() - 0.5) * W * 0.8, (kit.rand() - 0.3) * H * 0.6, Z - 3, 2, 1.2);
    pixies.update(dt, envelope);
    motes.step(dt, 0.05, 0.25, 0.4, t);
    motes.material.opacity = (0.25 + pulse.level * 0.3) * envelope;
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   12. STEAMPUNK — Clockwork Sky
   ═══════════════════════════════════════════════════════════════════════ */
function buildSteampunk(kit: Kit): Frame {
  const { W, H, Z, visual } = kit;
  const gearTex = kit.track(canvasTexture(256, 256, (ctx) => {
    ctx.translate(128, 128);
    const teeth = 16;
    ctx.beginPath();
    for (let i = 0; i <= teeth * 2; i += 1) {
      const a = (i / (teeth * 2)) * TAU;
      const r = i % 2 ? 100 : 122;
      ctx.lineTo(Math.cos(a - 0.06) * r, Math.sin(a - 0.06) * r);
      ctx.lineTo(Math.cos(a + 0.06) * r, Math.sin(a + 0.06) * r);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 66, Math.sin(a) * 66, 20, 0, TAU);
      ctx.fill();
    }
  }));
  const gearMat = (color: string, o: number) => kit.full
    ? kit.track(new THREE.MeshBasicMaterial({ map: gearTex, color, transparent: true, opacity: o, depthWrite: false, fog: false }))
    : kit.track(additive(color, o * 0.4, gearTex));
  // Interlocking gear trains: adjacent gears turn opposite ways.
  const gearSpec: Array<[number, number, number, number, string]> = [
    [-W * 0.4, H * 0.25, 3.2, 1, "#5a3a1a"],
    [-W * 0.4 + 2.95, H * 0.25 - 1.6, 1.8, -1, "#7a5226"],
    [W * 0.38, -H * 0.05, 4.4, 1, "#4a2f14"],
    [W * 0.38 - 3.6, -H * 0.05 + 2.4, 2.2, -1, "#6a4520"],
    [W * 0.12, H * 0.35, 1.6, 1, "#7a5226"]
  ];
  const gears = gearSpec.map(([x, y, r, dir, color]) => {
    const m = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(1, 1)), gearMat(color, 0.9));
    m.position.set(x, y, Z - 10);
    m.scale.setScalar(r * 2);
    m.renderOrder = -8;
    kit.root.add(m);
    return { m, dir, r, angle: 0, target: 0 };
  });
  if (kit.full) {
    // Foundry horizon: sawtooth roofs and tall smokestacks.
    const p: Array<[number, number]> = [];
    const span = W * 1.3;
    const base = -H * 0.24;
    for (let x = -span / 2; x < span / 2; ) {
      if (kit.rand() < 0.25) {
        const h = H * (0.18 + kit.rand() * 0.14);
        p.push([x, base], [x, base + h], [x + 0.7, base + h], [x + 0.7, base]);
        x += 0.7;
      } else {
        p.push([x, base], [x + 1.6, base + 1.2], [x + 1.6, base]);
        x += 1.6;
      }
    }
    silhouette(kit, p, -H, Z - 11, "#0c0703", { color: visual.accent, opacity: 0.2 });
  }
  const boiler = sprite(kit, visual.accent, 0.25, 0, -H * 0.35, Z - 9, W * 1.2, H * 0.4);
  // Airship: hull ellipse + gondola.
  const ship = new THREE.Group();
  const hull = new THREE.Mesh(kit.track(new THREE.CircleGeometry(1, 48)), kit.track(new THREE.MeshBasicMaterial({ color: "#2a1a0e", fog: false, transparent: true, opacity: kit.full ? 1 : 0.7, depthWrite: false })));
  hull.scale.set(3.2, 0.9, 1);
  const gondola = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(1.4, 0.35)), hull.material);
  gondola.position.y = -1.05;
  ship.add(hull, gondola);
  const portholes = [-0.4, 0, 0.4].map((x) => {
    const s = new THREE.Sprite(spriteMat(kit, visual.accentBright, 0.8));
    s.position.set(x, -1.05, 0.01);
    s.scale.setScalar(0.25);
    ship.add(s);
    return s;
  });
  ship.position.set(-W * 0.6, H * 0.12, Z - 7);
  kit.root.add(ship);
  const steam = Array.from({ length: kit.n(14) }, () => {
    const s = sprite(kit, "#d8d0c4", 0, 0, 0, Z - 6, 1);
    s.material.blending = THREE.NormalBlending;
    return { s, life: 0, vx: 0, vy: 0 };
  });
  let steamCursor = 0;
  const soot = driftField(kit, kit.n(200), "#8a7a6a", 0.06, 0.4, 7);
  const sparks = sparkPool(kit, kit.n(120), visual.accentBright, 0.09, -4);

  return ({ t, dt, envelope, pulse }) => {
    // Gears TICK on the kick — a clockwork escapement, not a smooth spin.
    if (pulse.kickHit) for (const g of gears) g.target += (TAU / 32) * g.dir / (g.r * 0.5);
    for (const g of gears) {
      g.target += dt * 0.04 * g.dir / g.r;
      g.angle += (g.target - g.angle) * Math.min(1, dt * 18);
      g.m.rotation.z = g.angle;
    }
    boiler.material.opacity = (0.18 + pulse.swell * 0.3 + pulse.sub * 0.15) * envelope;
    ship.position.x += dt * 0.5;
    ship.position.y = H * 0.12 + Math.sin(t * 0.4) * 0.3;
    if (ship.position.x > W * 0.7) ship.position.x = -W * 0.7;
    portholes.forEach((p) => (p.material.opacity = (0.5 + pulse.kick * 0.5) * envelope));
    if (pulse.snareHit) {
      for (let k = 0; k < 3; k += 1) {
        const s = steam[steamCursor];
        steamCursor = (steamCursor + 1) % steam.length;
        s.life = 1;
        s.s.position.set(ship.position.x - 3 + kit.rand(), ship.position.y + 0.4, Z - 6.9);
        s.vx = -0.6 - kit.rand() * 0.6;
        s.vy = 0.8 + kit.rand() * 0.6;
      }
    }
    for (const s of steam) {
      if (s.life <= 0) {
        s.s.material.opacity = 0;
        continue;
      }
      s.life -= dt * 0.5;
      s.s.position.x += s.vx * dt;
      s.s.position.y += s.vy * dt;
      s.s.scale.setScalar(0.6 + (1 - s.life) * 2.4);
      s.s.material.opacity = s.life * 0.35 * envelope;
    }
    soot.step(dt, 0.3, -0.35, 0.3, t);
    soot.material.opacity = (0.3 + pulse.level * 0.2) * envelope;
    if (pulse.hatHit) sparks.burst(gears[2].m.position.x - gears[2].r, gears[2].m.position.y, Z - 9.5, 4, 2.5, 1.2, Math.PI * 0.75);
    sparks.update(dt, envelope);
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   13. PIRATE — Moonlit Sea
   ═══════════════════════════════════════════════════════════════════════ */
function buildPirate(kit: Kit): Frame {
  const { W, H, Z, visual } = kit;
  const moon = sprite(kit, "#fff4d8", 0.7, W * 0.2, H * 0.28, Z - 24, H * 0.18);
  const moonHalo = sprite(kit, visual.secondary, 0.25, W * 0.2, H * 0.28, Z - 24.1, H * 0.8);
  const stars = cloud(kit, kit.n(260), 0xffffff, 0.08, 0.7);
  for (let i = 0; i < stars.count; i += 1) {
    stars.positions[i * 3] = (kit.rand() - 0.5) * W * 1.6;
    stars.positions[i * 3 + 1] = kit.rand() * H * 0.7;
    stars.positions[i * 3 + 2] = Z - 20 - kit.rand() * 6;
  }
  stars.attr.needsUpdate = true;
  // The sea: a displaced grid seen at a grazing angle.
  const seaMat = kit.full
    ? kit.track(new THREE.MeshBasicMaterial({ color: "#061820", fog: false, depthWrite: false, side: THREE.DoubleSide }))
    : kit.track(additive("#2f9aa8", 0.08));
  const sea = sheet(kit, W * 2.2, 40, 80, 40, seaMat);
  sea.mesh.rotation.x = -Math.PI / 2;
  sea.mesh.position.set(0, -H * 0.3, Z - 14);
  // Before the galleon (-10) so its hull sits on the water, after the sky.
  sea.mesh.renderOrder = -11;
  // Crest lines share the displaced geometry, so they ride the same swell.
  const crestMat = kit.track(new THREE.MeshBasicMaterial({ color: visual.secondary, wireframe: true, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false }));
  const crests = new THREE.Mesh(sea.geometry, crestMat);
  crests.rotation.copy(sea.mesh.rotation);
  crests.position.copy(sea.mesh.position);
  crests.frustumCulled = false;
  kit.root.add(crests);
  // A glittering moon path on the water.
  const glitter = cloud(kit, kit.n(140), "#fff4d8", 0.14, 0.8);
  const gseed = new Float32Array(glitter.count);
  for (let i = 0; i < glitter.count; i += 1) {
    const d = kit.rand();
    glitter.positions[i * 3] = W * 0.2 + (kit.rand() - 0.5) * (1 + d * 6);
    glitter.positions[i * 3 + 1] = -H * 0.3 + 0.05;
    glitter.positions[i * 3 + 2] = Z - 30 + d * 26;
    gseed[i] = kit.rand() * 9;
  }
  glitter.attr.needsUpdate = true;
  // Ghost galleon silhouette on the horizon.
  if (kit.full) {
    const gx = -W * 0.22;
    const gy = -H * 0.3 + 0.1;
    silhouette(kit, [
      [gx - 2.4, gy], [gx - 2.8, gy + 0.7], [gx - 1.4, gy + 0.55], [gx - 1.4, gy + 3.2], [gx - 1.3, gy + 3.2], [gx - 1.3, gy + 0.55],
      [gx - 0.1, gy + 0.55], [gx - 0.1, gy + 3.8], [gx, gy + 3.8], [gx, gy + 0.55], [gx + 1.1, gy + 0.55], [gx + 1.1, gy + 2.9],
      [gx + 1.2, gy + 2.9], [gx + 1.2, gy + 0.55], [gx + 2.2, gy + 0.85], [gx + 2.6, gy]
    ], gy - 0.6, Z - 13, "#02080b");
    // Sails as soft pale panels.
    for (const [sx, sy, w, h] of [[gx - 1.35, gy + 1.9, 1.5, 1.6], [gx - 0.05, gy + 2.2, 1.8, 2.0], [gx + 1.15, gy + 1.8, 1.4, 1.4]]) {
      const sail = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(w, h, 1, 4)), kit.track(new THREE.MeshBasicMaterial({ color: "#a8c8c4", transparent: true, opacity: 0.12, fog: false, depthWrite: false })));
      // Billow the sail outward so it reads as cloth, not a panel.
      const sp = sail.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < sp.count; i += 1) sp.setX(i, sp.getX(i) * (0.85 + 0.15 * Math.cos((sp.getY(i) / h) * Math.PI)));
      sail.position.set(sx, sy, Z - 12.99);
      kit.root.add(sail);
    }
  }
  const lanterns = Array.from({ length: kit.n(5) }, (_, i) => sprite(kit, visual.accent, 0.6, -W * 0.3 + i * W * 0.15, -H * 0.27, Z - 6 - i, 0.5));
  const spray = sparkPool(kit, kit.n(160), "#cfeff2", 0.1, -6);
  let crest = 0;
  const amp = { v: 0.4 };

  return ({ t, dt, envelope, pulse }) => {
    if (pulse.kickHit) crest = 1;
    crest = Math.max(0, crest - dt * 1.4);
    amp.v += (0.35 + pulse.bass * 0.9 + pulse.swell * 1.2 - amp.v) * Math.min(1, dt * 2);
    for (let i = 0; i < sea.attr.count; i += 1) {
      const x = sea.base[i * 3];
      const y = sea.base[i * 3 + 1];
      const wave = Math.sin(x * 0.35 + t * 0.9) * 0.5 + Math.sin(y * 0.5 - t * 1.1 + x * 0.1) * 0.5 + Math.sin((x + y) * 0.9 + t * 2) * 0.15;
      const roll = crest * Math.exp(-Math.pow((y - 20 + crest * 40) * 0.25, 2)) * 1.5;
      sea.attr.setZ(i, wave * amp.v + roll);
    }
    sea.attr.needsUpdate = true;
    crestMat.opacity = (0.08 + pulse.bass * 0.12 + crest * 0.15) * envelope;
    if (kit.full) (seaMat as THREE.MeshBasicMaterial).color.set("#061820").lerp(tmpColor.set(visual.secondary), 0.05 + pulse.swell * 0.12);
    else (seaMat as THREE.MeshBasicMaterial).opacity = (0.05 + pulse.swell * 0.08) * envelope;
    for (let i = 0; i < glitter.count; i += 1) {
      glitter.positions[i * 3 + 1] = -H * 0.3 + Math.sin(t * 1.3 + gseed[i]) * 0.15 * amp.v + 0.1;
    }
    glitter.attr.needsUpdate = true;
    glitter.material.opacity = (0.4 + pulse.hat * 0.5 + Math.sin(t * 4) * 0.1) * envelope;
    stars.material.opacity = (0.5 + pulse.hat * 0.4) * envelope;
    moon.material.opacity = (0.65 + pulse.swell * 0.2) * envelope;
    moonHalo.material.opacity = (0.18 + pulse.swell * 0.2) * envelope;
    lanterns.forEach((l, i) => {
      l.position.y = -H * 0.27 + Math.sin(t * 1.1 + i) * 0.2 * amp.v + 0.3;
      l.material.opacity = (0.45 + Math.sin(t * 5 + i * 2) * 0.1 + pulse.kick * 0.3) * envelope;
    });
    if (pulse.snareHit) spray.burst((kit.rand() - 0.5) * W * 0.8, -H * 0.28, Z - 4 - kit.rand() * 4, 18, 4.5, 1.0);
    spray.update(dt, envelope);
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   14. EAST ASIAN — Lantern Festival
   ═══════════════════════════════════════════════════════════════════════ */
function buildEastasian(kit: Kit): Frame {
  const { W, H, Z, visual } = kit;
  const moon = sprite(kit, "#ffe8d0", 0.7, -W * 0.25, H * 0.22, Z - 22, H * 0.3);
  const moonHalo = sprite(kit, visual.accent, 0.18, -W * 0.25, H * 0.22, Z - 22.1, H * 0.9);
  if (kit.full) {
    // Ink-wash mountains: three receding ranges, paler with distance.
    silhouette(kit, ridge(kit, -H * 0.05, H * 0.3, 12, 1.0), -H, Z - 18, "#1a1420");
    silhouette(kit, ridge(kit, -H * 0.18, H * 0.22, 14, 0.9), -H, Z - 14, "#120d16");
    // Pagoda: stacked flared roofs.
    const px = W * 0.25;
    let y = -H * 0.32;
    const profile: Array<[number, number]> = [[px - 1.2, y]];
    const tiers = 5;
    for (let i = 0; i < tiers; i += 1) {
      const w = 1.9 - i * 0.28;
      profile.push([px - w * 0.55, y + 0.1], [px - w, y + 0.75], [px - w * 0.5, y + 0.9]);
      y += 1.1;
    }
    profile.push([px, y + 1.2]);
    for (let i = tiers - 1; i >= 0; i -= 1) {
      y -= 1.1;
      const w = 1.9 - i * 0.28;
      profile.push([px + w * 0.5, y + 0.9], [px + w, y + 0.75], [px + w * 0.55, y + 0.1]);
    }
    profile.push([px + 1.2, -H * 0.32]);
    silhouette(kit, profile, -H, Z - 9, "#0a0608");
    silhouette(kit, ridge(kit, -H * 0.36, H * 0.04, 10, 0.3), -H, Z - 7, "#07040a");
  }
  // Sky lanterns: warm rounded glows rising.
  const LANTERNS = kit.n(36);
  const lanterns = Array.from({ length: LANTERNS }, () => {
    const s = sprite(kit, "#ff9a4a", 0.6, (kit.rand() - 0.5) * W, (kit.rand() - 0.5) * H, Z - 2 - kit.rand() * 12, 0.5, 0.65);
    const core = sprite(kit, "#ffe0a0", 0.8, s.position.x, s.position.y, s.position.z + 0.01, 0.2, 0.28);
    return { s, core, v: 0.25 + kit.rand() * 0.35, sway: kit.rand() * 9, lift: 0, size: 0.5 * (1 - (Z - s.position.z) / 20) + 0.2 };
  });
  // Cherry blossom petals.
  const PETALS = kit.n(140);
  const petals = cloud(kit, PETALS, "#ffb7c8", 0.13, 0.85);
  petals.material.blending = THREE.NormalBlending;
  const pv = Array.from({ length: PETALS }, () => ({ x: (kit.rand() - 0.5) * W, y: (kit.rand() - 0.5) * H, z: Z - kit.rand() * 6, s: kit.rand() }));
  let gust = 0;
  const glints = sparkPool(kit, kit.n(80), "#fff0c0", 0.08, 0.2);

  return ({ t, dt, envelope, pulse }) => {
    moon.material.opacity = (0.55 + pulse.swell * 0.2) * envelope;
    moonHalo.material.opacity = (0.12 + pulse.swell * 0.2) * envelope;
    for (const l of lanterns) {
      if (pulse.kickHit) l.lift = 1;
      l.lift = Math.max(0, l.lift - dt * 1.5);
      l.s.position.y += (l.v + l.lift * 0.8) * dt;
      l.s.position.x += Math.sin(t * 0.3 + l.sway) * dt * 0.2;
      if (l.s.position.y > H * 0.6) {
        l.s.position.y = -H * 0.6;
        l.s.position.x = (kit.rand() - 0.5) * W;
      }
      l.core.position.set(l.s.position.x, l.s.position.y - 0.05, l.s.position.z + 0.01);
      l.s.scale.set(l.size * (1 + l.lift * 0.2), l.size * 1.3 * (1 + l.lift * 0.2), 1);
      l.core.scale.set(l.size * 0.4, l.size * 0.55, 1);
      l.s.material.opacity = (0.45 + l.lift * 0.4 + Math.sin(t * 3 + l.sway) * 0.06) * envelope;
      l.core.material.opacity = (0.65 + l.lift * 0.35) * envelope;
    }
    if (pulse.snareHit) gust = 1;
    gust = Math.max(0, gust - dt * 0.8);
    for (let i = 0; i < PETALS; i += 1) {
      const p = pv[i];
      p.x += (0.5 + gust * 5 + Math.sin(t * 0.8 + p.s * 20) * 0.6) * dt;
      p.y += (-0.5 - p.s * 0.4 + Math.cos(t * 1.4 + p.s * 30) * 0.4 + gust * 0.6) * dt;
      if (p.x > W / 2) p.x -= W;
      if (p.y < -H / 2) p.y += H;
      if (p.y > H / 2) p.y -= H;
      petals.positions[i * 3] = p.x;
      petals.positions[i * 3 + 1] = p.y;
      petals.positions[i * 3 + 2] = p.z;
    }
    petals.attr.needsUpdate = true;
    petals.material.opacity = 0.75 * envelope;
    if (pulse.hatHit) glints.burst((kit.rand() - 0.5) * W * 0.9, -H * 0.3 + kit.rand() * H * 0.3, Z - 3, 2, 0.8);
    glints.update(dt, envelope);
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   15. SUPERHERO — Signal City
   ═══════════════════════════════════════════════════════════════════════ */
function buildSuperhero(kit: Kit): Frame {
  const { W, H, Z, visual } = kit;
  if (kit.full) {
    silhouette(kit, skyline(kit, -H * 0.1, H * 0.1, H * 0.5, 14, 0.35), -H, Z - 12, "#0c1022", { color: visual.secondary, opacity: 0.25 });
    silhouette(kit, skyline(kit, -H * 0.28, H * 0.05, H * 0.3, 9, 0.1), -H, Z - 6, "#070914");
  }
  const windows = cloud(kit, kit.full ? 120 : 1, "#ffe6a0", 0.13, kit.full ? 0.6 : 0);
  const wseed = new Float32Array(windows.count);
  for (let i = 0; i < windows.count; i += 1) {
    windows.positions[i * 3] = (kit.rand() - 0.5) * W * 1.1;
    windows.positions[i * 3 + 1] = -H * 0.1 + kit.rand() * H * 0.45;
    windows.positions[i * 3 + 2] = Z - 11.9;
    wseed[i] = kit.rand();
  }
  windows.attr.needsUpdate = true;
  // Searchlights sweeping, one carrying the emblem onto the clouds.
  const shaftTex = kit.track(shaftTexture(true));
  const beams = [-0.3, 0.05, 0.35].map((fx, i) => {
    // Pivot at the base so the beam swings from the rooftop it stands on.
    const m = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(2.2, H * 1.5).translate(0, H * 0.75, 0)), kit.track(additive(i === 1 ? "#fff4c0" : "#cfe4ff", 0.1, shaftTex)));
    m.position.set(W * fx, -H * 0.3, Z - 10.5);
    kit.root.add(m);
    return { m, seed: i * 1.7 };
  });
  const clouds = sprite(kit, "#3a4a70", 0.3, 0, H * 0.32, Z - 13, W * 1.4, H * 0.3);
  const emblemTex = kit.track(canvasTexture(256, 256, (ctx) => {
    ctx.translate(128, 128);
    ctx.fillStyle = "rgba(255,240,180,0.9)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 120, 80, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    // A lightning-bolt emblem cut out of the disc.
    ctx.beginPath();
    ctx.moveTo(20, -70);
    ctx.lineTo(-40, 10);
    ctx.lineTo(0, 10);
    ctx.lineTo(-20, 70);
    ctx.lineTo(45, -15);
    ctx.lineTo(5, -15);
    ctx.closePath();
    ctx.fill();
  }));
  const emblem = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(4, 4)), kit.track(additive(0xffffff, 0.3, emblemTex)));
  emblem.position.set(W * 0.05, H * 0.32, Z - 12.9);
  kit.root.add(emblem);
  // Impact lines: radial comic speed lines on the kick.
  const SPOKES = 36;
  const impact = segments(kit, SPOKES, "#ffffff", 0);
  let impactLife = 0;
  const center = new THREE.Vector2();
  // Halftone pop: a dotted disc flash on the snare.
  const halftoneTex = kit.track(canvasTexture(256, 256, (ctx) => {
    for (let y = 8; y < 256; y += 16) {
      for (let x = 8; x < 256; x += 16) {
        const d = Math.hypot(x - 128, y - 128) / 128;
        if (d > 1) continue;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.arc(x, y, 6 * (1 - d), 0, TAU);
        ctx.fill();
      }
    }
  }));
  const pop = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(1, 1)), kit.track(additive(visual.accent, 0, halftoneTex)));
  pop.position.z = Z - 1;
  kit.root.add(pop);
  let popLife = 0;

  return ({ t, dt, envelope, pulse }) => {
    beams.forEach((b, i) => {
      b.m.rotation.z = Math.sin(t * (0.2 + i * 0.05) + b.seed) * 0.45;
      (b.m.material as THREE.MeshBasicMaterial).opacity = (0.08 + pulse.swell * 0.14 + (i === 1 ? 0.06 : 0)) * envelope;
    });
    // The emblem rides where the main beam meets the cloud deck.
    const main = beams[1].m;
    const reach = (H * 0.32 - main.position.y) / Math.max(0.3, Math.cos(main.rotation.z));
    emblem.position.x = main.position.x - Math.sin(main.rotation.z) * reach;
    (emblem.material as THREE.MeshBasicMaterial).opacity = (0.18 + pulse.swell * 0.35 + pulse.kick * 0.1) * envelope;
    clouds.material.opacity = (0.22 + pulse.swell * 0.1) * envelope;
    if (kit.full) {
      windows.material.opacity = (0.45 + pulse.hat * 0.35) * envelope;
    }
    if (pulse.kickHit && pulse.kick > 0.85 && impactLife <= 0) {
      impactLife = 1;
      center.set((kit.rand() - 0.5) * W * 0.4, (kit.rand() - 0.5) * H * 0.3);
    }
    impactLife = Math.max(0, impactLife - dt * 3.5);
    for (let i = 0; i < SPOKES; i += 1) {
      const a = (i / SPOKES) * TAU + (i % 2) * 0.05;
      const r0 = H * (0.25 + (1 - impactLife) * 0.3);
      const r1 = r0 + H * (0.25 + (i % 3) * 0.08);
      impact.attr.setXYZ(i * 2, center.x + Math.cos(a) * r0, center.y + Math.sin(a) * r0, Z - 0.5);
      impact.attr.setXYZ(i * 2 + 1, center.x + Math.cos(a) * r1, center.y + Math.sin(a) * r1, Z - 0.5);
    }
    impact.attr.needsUpdate = true;
    impact.material.opacity = impactLife * 0.45 * envelope;
    if (pulse.snareHit && popLife <= 0.3) {
      popLife = 1;
      pop.position.x = (kit.rand() - 0.5) * W * 0.6;
      pop.position.y = (kit.rand() - 0.5) * H * 0.4;
    }
    popLife = Math.max(0, popLife - dt * 2.5);
    pop.scale.setScalar(H * (0.15 + (1 - popLife) * 0.2));
    (pop.material as THREE.MeshBasicMaterial).opacity = popLife * 0.35 * envelope;
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   16. PULP — Lost Expedition
   ═══════════════════════════════════════════════════════════════════════ */
function buildPulp(kit: Kit): Frame {
  const { W, H, Z, visual } = kit;
  const sky = sprite(kit, visual.accent, 0.3, 0, H * 0.1, Z - 20, W * 1.5, H * 1.0);
  if (kit.full) {
    // Step-pyramid temple rising out of the jungle.
    const tx = W * 0.22;
    const base = -H * 0.25;
    const tiers: Array<[number, number]> = [];
    let w = 4.6;
    let y = base;
    tiers.push([tx - w, base]);
    for (let i = 0; i < 5; i += 1) {
      tiers.push([tx - w, y + 0.8], [tx - w + 0.45, y + 0.8]);
      w -= 0.45 + 0.15;
      y += 0.8;
    }
    tiers.push([tx - 0.7, y + 1.1], [tx + 0.7, y + 1.1]);
    for (let i = 4; i >= 0; i -= 1) {
      w += 0.6;
      y -= 0.8;
      tiers.push([tx + w - 0.45, y + 0.8], [tx + w, y + 0.8]);
    }
    tiers.push([tx + 4.6, base]);
    silhouette(kit, tiers, -H, Z - 12, "#10140a", { color: visual.accent, opacity: 0.25 });
    // Canopy: lumpy tree line front.
    const canopy: Array<[number, number]> = [];
    for (let i = 0; i <= 40; i += 1) {
      const x = (i / 40 - 0.5) * W * 1.3;
      canopy.push([x, -H * 0.28 + Math.abs(Math.sin(i * 1.3)) * H * 0.08 + kit.rand() * 0.4]);
    }
    silhouette(kit, canopy, -H, Z - 6, "#060a04");
  }
  // Canopy god-rays.
  const shaftTex = kit.track(shaftTexture());
  const rays = Array.from({ length: 5 }, (_, i) => {
    const m = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(1.6 + i * 0.3, H * 1.3)), kit.track(additive(visual.accentBright, 0.08, shaftTex)));
    m.position.set(-W * 0.35 + i * W * 0.14, H * 0.1, Z - 8);
    m.rotation.z = 0.35;
    kit.root.add(m);
    return m;
  });
  // The red route: a dashed line advancing across the frame on each snare.
  const ROUTE = 48;
  const route = segments(kit, ROUTE, "#d8312a", 0.9);
  const routePts: number[] = [];
  for (let i = 0; i <= ROUTE * 2; i += 1) {
    const k = i / (ROUTE * 2);
    routePts.push(-W * 0.45 + k * W * 0.9, H * 0.3 - k * H * 0.25 + Math.sin(k * 9) * H * 0.07);
  }
  let routeShown = 0;
  let routeTarget = 0;
  const marker = sprite(kit, "#ff5a40", 0, 0, 0, Z - 1.9, 0.6);
  // Biplane crossing.
  const plane = segments(kit, 4, "#120a04", 1);
  plane.material.blending = THREE.NormalBlending;
  let planeX = -W * 0.7;
  // Torches on the temple.
  const torches = [-1, 1].map((d) => sprite(kit, "#ff8a2a", 0.6, W * 0.22 + d * 2.2, -H * 0.25 + 1.4, Z - 11.9, 0.7));
  const motes = driftField(kit, kit.n(150), "#ffd48f", 0.07, 0.5, 6);

  return ({ t, dt, envelope, pulse }) => {
    sky.material.opacity = (0.18 + pulse.swell * 0.15) * envelope;
    rays.forEach((r, i) => ((r.material as THREE.MeshBasicMaterial).opacity = (0.04 + pulse.swell * 0.12 + Math.max(0, Math.sin(t * 0.2 + i)) * 0.04) * envelope));
    if (pulse.snareHit) routeTarget = Math.min(ROUTE, routeTarget + 2);
    if (routeTarget >= ROUTE && routeShown >= ROUTE - 0.01) {
      routeTarget = 0;
      routeShown = 0;
    }
    routeShown += (routeTarget - routeShown) * Math.min(1, dt * 6);
    for (let i = 0; i < ROUTE; i += 1) {
      const on = i < routeShown;
      route.attr.setXYZ(i * 2, routePts[i * 4], on ? routePts[i * 4 + 1] : -999, Z - 2);
      route.attr.setXYZ(i * 2 + 1, routePts[i * 4 + 2], on ? routePts[i * 4 + 3] : -999, Z - 2);
    }
    route.attr.needsUpdate = true;
    route.material.opacity = 0.85 * envelope;
    const head = Math.min(ROUTE * 2 - 1, Math.floor(routeShown * 2));
    marker.position.set(routePts[head * 2], routePts[head * 2 + 1], Z - 1.9);
    marker.material.opacity = (routeShown > 0.2 ? 0.5 + pulse.snare * 0.5 : 0) * envelope;
    planeX += dt * 2.2;
    if (planeX > W * 0.7) planeX = -W * 0.7;
    const py = H * 0.32 + Math.sin(t * 0.8) * 0.4;
    const pz = Z - 9;
    plane.attr.setXYZ(0, planeX - 0.6, py, pz);
    plane.attr.setXYZ(1, planeX + 0.6, py, pz);
    plane.attr.setXYZ(2, planeX - 0.5, py + 0.25, pz);
    plane.attr.setXYZ(3, planeX + 0.5, py + 0.25, pz);
    plane.attr.setXYZ(4, planeX - 0.1, py - 0.15, pz);
    plane.attr.setXYZ(5, planeX + 0.8, py + 0.05, pz);
    plane.attr.setXYZ(6, planeX - 0.7, py, pz);
    plane.attr.setXYZ(7, planeX - 0.85, py + 0.3, pz);
    plane.attr.needsUpdate = true;
    plane.material.opacity = 0.9 * envelope;
    torches.forEach((tc, i) => {
      tc.material.opacity = (0.45 + pulse.kick * 0.5 + Math.sin(t * 11 + i * 3) * 0.08) * envelope;
      tc.scale.setScalar(0.6 + pulse.kick * 0.6);
    });
    motes.step(dt, 0.1, 0.12, 0.3 + pulse.hat * 0.8, t);
    motes.material.opacity = (0.3 + pulse.hat * 0.3) * envelope;
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   17. COZY — Hearth Meadow
   ═══════════════════════════════════════════════════════════════════════ */
function buildCozy(kit: Kit): Frame {
  const { W, H, Z, visual } = kit;
  const sunset = sprite(kit, visual.accent, 0.35, W * 0.1, -H * 0.15, Z - 20, W * 1.4, H * 0.9);
  const sun = sprite(kit, "#ffe0b8", 0.5, W * 0.1, -H * 0.12, Z - 19.9, H * 0.25);
  if (kit.full) {
    const hill = (base: number, amp: number, z: number, color: string, freq: number, phase: number) => {
      const p: Array<[number, number]> = [];
      for (let i = 0; i <= 30; i += 1) {
        const x = (i / 30 - 0.5) * W * 1.3;
        p.push([x, base + Math.sin(i * freq + phase) * amp + Math.sin(i * freq * 0.37) * amp * 0.5]);
      }
      silhouette(kit, p, -H, z, color);
    };
    hill(-H * 0.2, H * 0.05, Z - 14, "#2a3a2a", 0.3, 1);
    hill(-H * 0.3, H * 0.04, Z - 9, "#1c281c", 0.42, 2.4);
    // Cottage with a lit window and a chimney.
    const cx = -W * 0.2;
    const cy = -H * 0.27;
    silhouette(kit, [[cx - 1.2, cy], [cx - 1.2, cy + 1.0], [cx - 1.45, cy + 1.0], [cx, cy + 2.0], [cx + 0.55, cy + 1.6], [cx + 0.55, cy + 2.1], [cx + 0.85, cy + 2.1], [cx + 0.85, cy + 1.38], [cx + 1.45, cy + 1.0], [cx + 1.2, cy + 1.0], [cx + 1.2, cy]], cy - 1, Z - 8.9, "#120c08");
  }
  const window_ = sprite(kit, "#ffc070", kit.full ? 0.8 : 0, -W * 0.2 - 0.4, -H * 0.27 + 0.5, Z - 8.8, 0.7);
  const smoke = Array.from({ length: kit.full ? 8 : 0 }, (_, i) => {
    const s = sprite(kit, "#c8c0b8", 0.12, 0, 0, Z - 9, 0.5);
    s.material.blending = THREE.NormalBlending;
    return { s, phase: i / 8 };
  });
  const flies = driftField(kit, kit.n(70), "#fff0a0", 0.15, 0.8, 6);
  for (let i = 0; i < flies.count; i += 1) flies.positions[i * 3 + 1] = -H * 0.45 + kit.rand() * H * 0.35;
  const seeds = sparkPool(kit, kit.n(120), "#fff8ec", 0.1, -0.15);
  const clouds = Array.from({ length: 4 }, (_, i) => {
    const s = sprite(kit, "#ffd8c0", 0.18, -W * 0.5 + i * W * 0.3, H * (0.22 + (i % 2) * 0.1), Z - 16, 6, 1.6);
    s.material.blending = THREE.NormalBlending;
    return s;
  });
  let bloom = 0;
  let warmth = 0;

  return ({ t, dt, envelope, pulse }) => {
    warmth += (pulse.swell + pulse.level * 0.5 - warmth) * Math.min(1, dt * 0.8);
    sunset.material.opacity = (0.25 + warmth * 0.25) * envelope;
    sunset.material.color.set(visual.accent).lerp(tmpColor.set("#ff7a6a"), clamp01(warmth));
    sun.material.opacity = (0.4 + warmth * 0.2) * envelope;
    if (pulse.kickHit) bloom = 1;
    bloom = Math.max(0, bloom - dt * 1.3);
    flies.step(dt, 0.1, 0.1 + bloom * 0.3, 0.5 + bloom * 0.6, t);
    flies.material.opacity = (0.4 + bloom * 0.35 + pulse.hat * 0.25 + Math.sin(t * 2) * 0.1) * envelope;
    flies.material.size = (0.12 + bloom * 0.08) * 2.4;
    window_.material.opacity = kit.full ? (0.7 + Math.sin(t * 2.3) * 0.05 + pulse.kick * 0.15) * envelope : 0;
    for (const s of smoke) {
      s.phase = (s.phase + dt * 0.08) % 1;
      s.s.position.set(-W * 0.2 + 0.7 + Math.sin(s.phase * 5 + t * 0.3) * 0.4 + s.phase * 1.2, -H * 0.27 + 2.2 + s.phase * 3.5, Z - 9);
      s.s.scale.setScalar(0.4 + s.phase * 1.6);
      s.s.material.opacity = Math.sin(s.phase * Math.PI) * 0.18 * envelope;
    }
    if (pulse.snareHit) seeds.burst((kit.rand() - 0.5) * W * 0.6, -H * 0.3, Z - 3, 6, 1.2, 1.2, Math.PI * 0.35);
    seeds.update(dt, envelope * 0.8);
    clouds.forEach((c, i) => {
      c.position.x += dt * 0.15;
      if (c.position.x > W * 0.7) c.position.x = -W * 0.7;
      c.material.opacity = (0.12 + warmth * 0.1) * envelope * (i % 2 ? 0.8 : 1);
    });
  };
}
