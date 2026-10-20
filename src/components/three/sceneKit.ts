"use client";

import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════════════════════
   SCENE KIT — the small shared toolbox behind the opening (WorldForge) and
   the finale (OutroTheater): math, canvas textures, disposal tracking, glow
   ribbons and one pooled CPU particle system with a shape atlas.

   Everything here is allocation-free per frame and every GPU resource it
   creates goes through a Tracker, so a scene tears down in one call.
   ═══════════════════════════════════════════════════════════════════════ */

export const TAU = Math.PI * 2;
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Hermite smoothstep of x between edges a and b. */
export const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOutCubic = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
/** Exponential approach factor for a rate, frame-rate independent. */
export const approach = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hashString = (text: string) => text.split("").reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);

/* ── disposal ─────────────────────────────────────────────────────────── */

export type Tracker = {
  track: <T extends { dispose: () => void }>(item: T) => T;
  dispose: () => void;
};

export function createTracker(): Tracker {
  const items: Array<{ dispose: () => void }> = [];
  return {
    track: (item) => {
      items.push(item);
      return item;
    },
    dispose: () => {
      for (let i = items.length - 1; i >= 0; i -= 1) items[i].dispose();
      items.length = 0;
    }
  };
}

/* ── canvas textures ──────────────────────────────────────────────────── */

export function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void, srgb = true) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Soft radial glow: hot core, long feathered falloff. */
export function glowTexture() {
  return canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 1, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.18, "rgba(255,255,255,0.6)");
    g.addColorStop(0.5, "rgba(255,255,255,0.14)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

/** Light shaft: bright at the source (bottom of the texture), feathered sides. */
export function shaftTexture() {
  return canvasTexture(64, 256, (ctx) => {
    const v = ctx.createLinearGradient(0, 256, 0, 0);
    v.addColorStop(0, "rgba(255,255,255,0.95)");
    v.addColorStop(0.35, "rgba(255,255,255,0.35)");
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
export function streakTexture() {
  return canvasTexture(256, 16, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.75, "rgba(255,255,255,0.4)");
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

/** Radiating god-ray fan for suns and flares (soft wedges round a hot core). */
export function raysTexture(rays = 18) {
  return canvasTexture(512, 512, (ctx) => {
    ctx.translate(256, 256);
    for (let i = 0; i < rays; i += 1) {
      const angle = (i / rays) * TAU + (i % 3) * 0.07;
      const length = 150 + ((i * 53) % 7) * 15;
      const width = 0.035 + ((i * 31) % 5) * 0.012;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, length);
      g.addColorStop(0, "rgba(255,255,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, length, angle - width, angle + width);
      ctx.closePath();
      ctx.fill();
    }
  });
}

/**
 * Particle shape atlas, four cells left→right:
 *   0 dot · 1 petal/leaf · 2 square pixel · 3 four-point star
 */
export function shapeAtlasTexture() {
  return canvasTexture(256, 64, (ctx) => {
    const cell = (i: number, draw: () => void) => {
      ctx.save();
      ctx.translate(i * 64 + 32, 32);
      draw();
      ctx.restore();
    };
    cell(0, () => {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.3, "rgba(255,255,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-32, -32, 64, 64);
    });
    cell(1, () => {
      ctx.rotate(0.6);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 22, 0, 0, TAU);
      ctx.fill();
    });
    cell(2, () => {
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.fillRect(-11, -11, 22, 22);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(-18, -18, 36, 36);
    });
    cell(3, () => {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let k = 0; k < 8; k += 1) {
        const r = k % 2 ? 5 : 30;
        const a = (k / 8) * TAU;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    });
  });
}

export function additive(color: THREE.ColorRepresentation, opacity: number, map?: THREE.Texture | null) {
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

export function glowSprite(tracker: Tracker, map: THREE.Texture, color: THREE.ColorRepresentation, opacity = 1) {
  const material = tracker.track(new THREE.SpriteMaterial({
    map,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    fog: false
  }));
  return new THREE.Sprite(material);
}

/* ── particles ────────────────────────────────────────────────────────── */

export type ParticleShape = 0 | 1 | 2 | 3;

export type Spawn = {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  color: THREE.Color;
  alpha?: number;
  shape?: ParticleShape;
  /** Downward acceleration (negative rises). */
  gravity?: number;
  /** Velocity damping per second (0 = none). */
  drag?: number;
  /** Size multiplier reached at end of life. */
  grow?: number;
  /** 1 = steer toward the system's shared `target` and die on arrival. */
  homing?: number;
  /** Sideways flutter amplitude (petals, ash). */
  flutter?: number;
};

const PARTICLE_VERT = `
attribute float aSize;
attribute float aAlpha;
attribute float aShape;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying float vShape;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vShape = aShape;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
}`;

const PARTICLE_FRAG = `
uniform sampler2D uAtlas;
uniform float uOpacity;
varying float vAlpha;
varying float vShape;
varying vec3 vColor;
void main() {
  if (vAlpha < 0.003) discard;
  vec2 uv = vec2((gl_PointCoord.x + vShape) * 0.25, 1.0 - gl_PointCoord.y);
  float a = texture2D(uAtlas, uv).a * vAlpha * uOpacity;
  gl_FragColor = vec4(vColor * a, a);
}`;

export type ParticleSystem = {
  points: THREE.Points;
  spawn: (s: Spawn) => void;
  /** Steering target for homing particles. */
  target: THREE.Vector3;
  update: (dt: number) => void;
  setScale: (pixelsPerUnitAtOne: number) => void;
  material: THREE.ShaderMaterial;
  alive: () => number;
};

/** Pooled ballistic/homing particles drawn from the shape atlas. */
export function createParticles(tracker: Tracker, atlas: THREE.Texture, capacity: number, blending: THREE.Blending = THREE.AdditiveBlending): ParticleSystem {
  const pos = new Float32Array(capacity * 3);
  const col = new Float32Array(capacity * 3);
  const size = new Float32Array(capacity);
  const alpha = new Float32Array(capacity);
  const shape = new Float32Array(capacity);
  const vel = new Float32Array(capacity * 3);
  const life = new Float32Array(capacity);
  const age = new Float32Array(capacity);
  const base = new Float32Array(capacity * 2); // size0, alpha0
  const phys = new Float32Array(capacity * 5); // gravity, drag, grow, homing, flutter
  const geometry = tracker.track(new THREE.BufferGeometry());
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
  geometry.setAttribute("aShape", new THREE.BufferAttribute(shape, 1));
  const material = tracker.track(new THREE.ShaderMaterial({
    uniforms: { uAtlas: { value: atlas }, uScale: { value: 500 }, uOpacity: { value: 1 } },
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending
  }));
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const target = new THREE.Vector3();
  let cursor = 0;
  let live = 0;
  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
  const colAttr = geometry.getAttribute("aColor") as THREE.BufferAttribute;
  const sizeAttr = geometry.getAttribute("aSize") as THREE.BufferAttribute;
  const alphaAttr = geometry.getAttribute("aAlpha") as THREE.BufferAttribute;
  const shapeAttr = geometry.getAttribute("aShape") as THREE.BufferAttribute;
  let flutterClock = 0;
  return {
    points,
    target,
    material,
    alive: () => live,
    setScale: (s) => {
      material.uniforms.uScale.value = s;
    },
    spawn: (s) => {
      const i = cursor;
      cursor = (cursor + 1) % capacity;
      pos[i * 3] = s.x;
      pos[i * 3 + 1] = s.y;
      pos[i * 3 + 2] = s.z;
      vel[i * 3] = s.vx ?? 0;
      vel[i * 3 + 1] = s.vy ?? 0;
      vel[i * 3 + 2] = s.vz ?? 0;
      col[i * 3] = s.color.r;
      col[i * 3 + 1] = s.color.g;
      col[i * 3 + 2] = s.color.b;
      life[i] = s.life;
      age[i] = 0;
      base[i * 2] = s.size;
      base[i * 2 + 1] = s.alpha ?? 1;
      shape[i] = s.shape ?? 0;
      phys[i * 5] = s.gravity ?? 0;
      phys[i * 5 + 1] = s.drag ?? 0;
      phys[i * 5 + 2] = s.grow ?? 1;
      phys[i * 5 + 3] = s.homing ?? 0;
      phys[i * 5 + 4] = s.flutter ?? 0;
      size[i] = s.size;
      alpha[i] = 0;
      colAttr.needsUpdate = true;
      shapeAttr.needsUpdate = true;
    },
    update: (dt) => {
      flutterClock += dt;
      live = 0;
      for (let i = 0; i < capacity; i += 1) {
        if (life[i] <= 0) {
          if (alpha[i] !== 0) alpha[i] = 0;
          continue;
        }
        age[i] += dt;
        const k = age[i] / life[i];
        if (k >= 1) {
          life[i] = 0;
          alpha[i] = 0;
          continue;
        }
        live += 1;
        const i3 = i * 3;
        const gravity = phys[i * 5];
        const drag = phys[i * 5 + 1];
        const homing = phys[i * 5 + 3];
        if (homing > 0) {
          const dx = target.x - pos[i3];
          const dy = target.y - pos[i3 + 1];
          const dz = target.z - pos[i3 + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d < 0.12) {
            life[i] = 0;
            alpha[i] = 0;
            continue;
          }
          // Steer harder as the particle ages so every mote arrives.
          const pull = homing * (2 + k * 14);
          vel[i3] += (dx / d) * pull * dt;
          vel[i3 + 1] += (dy / d) * pull * dt;
          vel[i3 + 2] += (dz / d) * pull * dt;
        }
        vel[i3 + 1] -= gravity * dt;
        if (drag > 0) {
          const damp = Math.exp(-drag * dt);
          vel[i3] *= damp;
          vel[i3 + 1] *= damp;
          vel[i3 + 2] *= damp;
        }
        const flutter = phys[i * 5 + 4];
        pos[i3] += (vel[i3] + (flutter ? Math.sin(flutterClock * 2.3 + i * 1.7) * flutter : 0)) * dt;
        pos[i3 + 1] += vel[i3 + 1] * dt;
        pos[i3 + 2] += vel[i3 + 2] * dt;
        const fadeIn = Math.min(1, k * 8);
        const fadeOut = 1 - smooth(0.6, 1, k);
        alpha[i] = base[i * 2 + 1] * fadeIn * fadeOut;
        size[i] = base[i * 2] * lerp(1, phys[i * 5 + 2], k);
      }
      posAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
    }
  };
}

/* ── ribbons ──────────────────────────────────────────────────────────── */

/**
 * A polyline traced as a glowing ribbon. Each vertex carries its arc-length
 * fraction (`aT`, 0..1 over the whole set), so one uniform draws the thread
 * on in order and a hot nib rides its head.
 */
export type TraceRibbon = {
  mesh: THREE.Mesh;
  uniforms: {
    uTrace: { value: number };
    uAlpha: { value: number };
    uNib: { value: number };
    uColor: { value: THREE.Color };
    uHot: { value: THREE.Color };
    uTime: { value: number };
    uShimmer: { value: number };
  };
  /** Head position (in the ribbon's local space) for a given trace fraction. */
  pointAt: (t: number, out: THREE.Vector3) => THREE.Vector3;
};

const RIBBON_VERT = `
attribute float aT;
attribute float aV;
varying float vT;
varying float vV;
void main() {
  vT = aT;
  vV = aV;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const RIBBON_FRAG = `
uniform float uTrace;
uniform float uAlpha;
uniform float uNib;
uniform float uTime;
uniform float uShimmer;
uniform vec3 uColor;
uniform vec3 uHot;
varying float vT;
varying float vV;
void main() {
  if (vT > uTrace) discard;
  float edge = 1.0 - smoothstep(0.25, 1.0, abs(vV));
  float behind = uTrace - vT;
  float nib = exp(-behind * 60.0) * uNib;
  float shimmer = 1.0 + uShimmer * sin(vT * 180.0 - uTime * 9.0) * 0.5;
  float a = edge * (uAlpha * shimmer + nib * 1.6);
  vec3 c = mix(uColor, uHot, clamp(nib * 1.4, 0.0, 1.0));
  gl_FragColor = vec4(c * a, a);
}`;

export function createTraceRibbon(tracker: Tracker, paths: Array<Array<[number, number]>>, width: number, z: number, closed = true, zs?: number[]): TraceRibbon {
  // Arc lengths over every path, in order, so the trace walks them in turn.
  type Seg = { ax: number; ay: number; bx: number; by: number; len: number; z: number };
  const segs: Seg[] = [];
  for (let pi = 0; pi < paths.length; pi += 1) {
    const path = paths[pi];
    const pz = zs?.[pi] ?? z;
    const n = path.length;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i += 1) {
      const a = path[i];
      const b = path[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > 1e-4) segs.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], len, z: pz });
    }
  }
  const total = segs.reduce((s, seg) => s + seg.len, 0) || 1;
  const cumulative: number[] = [];
  const positions: number[] = [];
  const ts: number[] = [];
  const vs: number[] = [];
  const indices: number[] = [];
  let acc = 0;
  const hw = width / 2;
  segs.forEach((seg, k) => {
    const t0 = acc / total;
    acc += seg.len;
    const t1 = acc / total;
    cumulative.push(t1);
    const nx = -(seg.by - seg.ay) / seg.len;
    const ny = (seg.bx - seg.ax) / seg.len;
    // Extend each quad by half a width so corners overlap instead of notching.
    const ex = ((seg.bx - seg.ax) / seg.len) * hw;
    const ey = ((seg.by - seg.ay) / seg.len) * hw;
    const base = k * 4;
    positions.push(
      seg.ax - ex + nx * hw, seg.ay - ey + ny * hw, seg.z,
      seg.ax - ex - nx * hw, seg.ay - ey - ny * hw, seg.z,
      seg.bx + ex + nx * hw, seg.by + ey + ny * hw, seg.z,
      seg.bx + ex - nx * hw, seg.by + ey - ny * hw, seg.z
    );
    ts.push(t0, t0, t1, t1);
    vs.push(1, -1, 1, -1);
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  });
  const geometry = tracker.track(new THREE.BufferGeometry());
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aT", new THREE.Float32BufferAttribute(ts, 1));
  geometry.setAttribute("aV", new THREE.Float32BufferAttribute(vs, 1));
  geometry.setIndex(indices);
  const uniforms = {
    uTrace: { value: 0 },
    uAlpha: { value: 0.6 },
    uNib: { value: 1 },
    uColor: { value: new THREE.Color() },
    uHot: { value: new THREE.Color() },
    uTime: { value: 0 },
    uShimmer: { value: 0 }
  };
  const material = tracker.track(new THREE.ShaderMaterial({
    uniforms,
    vertexShader: RIBBON_VERT,
    fragmentShader: RIBBON_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  }));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const pointAt = (t: number, out: THREE.Vector3) => {
    const target = clamp01(t);
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const seg = segs[lo];
    if (!seg) return out.set(0, 0, z);
    const start = lo > 0 ? cumulative[lo - 1] : 0;
    const k = clamp01((target - start) / Math.max(1e-6, cumulative[lo] - start));
    return out.set(lerp(seg.ax, seg.bx, k), lerp(seg.ay, seg.by, k), seg.z);
  };
  return { mesh, uniforms, pointAt };
}

/** Expanding ring pool (shockwaves, arrival rings, firework halos). */
export function createRingPool(tracker: Tracker, count: number, life = 1.2) {
  const geometry = tracker.track(new THREE.RingGeometry(0.9, 1, 96));
  const rings: Array<{ mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; age: number; size: number; peak: number }> = [];
  const group = new THREE.Group();
  for (let i = 0; i < count; i += 1) {
    const material = tracker.track(additive(0xffffff, 0));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    rings.push({ mesh, material, age: 99, size: 1, peak: 0.6 });
  }
  let cursor = 0;
  return {
    group,
    fire(x: number, y: number, z: number, size: number, peak: number, color: THREE.Color, flat = false) {
      const ring = rings[cursor];
      cursor = (cursor + 1) % rings.length;
      ring.mesh.position.set(x, y, z);
      ring.mesh.rotation.set(flat ? -Math.PI / 2 : 0, 0, 0);
      ring.age = 0;
      ring.size = size;
      ring.peak = peak;
      ring.material.color.copy(color);
      ring.mesh.visible = true;
    },
    update(dt: number) {
      for (const ring of rings) {
        if (!ring.mesh.visible) continue;
        ring.age += dt;
        const k = ring.age / life;
        if (k >= 1) {
          ring.mesh.visible = false;
          continue;
        }
        ring.mesh.scale.setScalar(0.05 + easeOutCubic(k) * ring.size);
        ring.material.opacity = (1 - k) * (1 - k) * ring.peak;
      }
    }
  };
}
