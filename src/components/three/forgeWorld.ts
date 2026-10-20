"use client";

import * as THREE from "three";
import type { ThemeKey, ThemeVisual } from "./themeVisuals";
import { TAU, canvasTexture, type Tracker } from "./sceneKit";

/* ═══════════════════════════════════════════════════════════════════════════
   THE FORGE WORLD — the two objects every saga is built around:

   THE ISLAND  A floating world-shard: a flat plateau over a craggy, tapering
               underside, cut into radial SECTORS. The sectors drift apart in
               the lobby, fly home and lock together during the Weaving, and
               in the finale they are what falls away (defeat), splits
               (bittersweet) or holds. Its top takes the genre's ground
               (moss, sand, asphalt, rust, deck plate…).

   THE D20     The forge itself: a numbered twenty-sided die hanging over the
               island. Its faces light one per hero in the lobby, it tumbles
               while it weaves, it slams down to show a 20 when the world
               holds — and at the end it rolls the world's fate.

   Opposite faces sum to 21, like a real die.
   ═══════════════════════════════════════════════════════════════════════ */

/** The genre's ground, as the island's plateau colour. */
const PLATEAU: Record<ThemeKey, string> = {
  none: "#3a3a4e",
  fantasy: "#3d5a3a",
  scifi: "#3a4656",
  horror: "#2e3326",
  noir: "#2a2d33",
  modern: "#3a4044",
  western: "#9a6a3a",
  postapoc: "#6a4a2c",
  cyberpunk: "#2c1f3c",
  spaceopera: "#3b3a56",
  gothic: "#2d2834",
  urbanfantasy: "#35303f",
  steampunk: "#5a4630",
  pirate: "#8c7a55",
  eastasian: "#3f5a40",
  superhero: "#3a4050",
  pulp: "#3d5a2c",
  cozy: "#5d8a45"
};

const PROFILE: Array<[number, number]> = [
  [0, 0.02], [3.0, 0.04], [5.6, 0.0], [6.3, -0.28], [6.15, -0.85], [5.3, -1.6], [4.1, -2.6], [2.7, -3.8], [1.3, -5.0], [0.35, -6.0], [0, -6.3]
];

const crag = (a: number, y: number) =>
  Math.sin(a * 5 + y * 1.3) * 0.5 + Math.sin(a * 11.3 - y * 2.1) * 0.3 + Math.sin(a * 23.1 + y * 3.7) * 0.2;

export type IslandChunk = {
  mesh: THREE.Mesh;
  home: THREE.Vector3;
  /** Unit direction it drifts / falls away along. */
  out: THREE.Vector3;
  /** Its middle angle around the island (x side tells bittersweet halves). */
  angle: number;
  seed: number;
  spin: THREE.Vector3;
};

export type Island = {
  group: THREE.Group;
  chunks: IslandChunk[];
  material: THREE.MeshStandardMaterial;
  crystals: THREE.MeshBasicMaterial;
  radius: number;
};

export function createIsland(visual: ThemeVisual, tracker: Tracker, rand: () => number, sectors = 9): Island {
  const group = new THREE.Group();
  const top = new THREE.Color(PLATEAU[visual.key] || PLATEAU.none);
  const rockHi = new THREE.Color(visual.fog).lerp(new THREE.Color("#4a4250"), 0.55);
  const rockLo = new THREE.Color(visual.fog).lerp(new THREE.Color(visual.secondary), 0.12).multiplyScalar(0.7);
  const material = tracker.track(new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.9,
    metalness: 0.05,
    emissive: new THREE.Color(visual.accent),
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
    transparent: true
  }));
  const crystals = tracker.track(new THREE.MeshBasicMaterial({
    color: new THREE.Color(visual.accentBright),
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  const crystalGeometry = tracker.track(new THREE.ConeGeometry(0.22, 1.2, 5));
  crystalGeometry.rotateX(Math.PI);
  const points = PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
  const chunks: IslandChunk[] = [];
  const color = new THREE.Color();
  for (let i = 0; i < sectors; i += 1) {
    const phiStart = (i / sectors) * TAU;
    const phiLength = TAU / sectors;
    const geometry = tracker.track(new THREE.LatheGeometry(points, 7, phiStart, phiLength));
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v += 1) {
      let x = pos.getX(v);
      let y = pos.getY(v);
      let z = pos.getZ(v);
      const r = Math.hypot(x, z);
      const a = Math.atan2(x, z);
      if (y < -0.15) {
        const k = 1 + 0.17 * crag(a, y);
        x *= k;
        z *= k;
        y += 0.28 * crag(a * 1.7 + 2, y * 0.5);
      } else if (r > 5.4) {
        const k = 1 + 0.05 * crag(a, 0);
        x *= k;
        z *= k;
      }
      pos.setXYZ(v, x, y, z);
      if (y > -0.1) color.copy(top).multiplyScalar(0.9 + 0.2 * (0.5 + 0.5 * crag(a * 2, r)));
      else color.copy(rockHi).lerp(rockLo, Math.min(1, -y / 6));
      colors[v * 3] = color.r;
      colors[v * 3 + 1] = color.g;
      colors[v * 3 + 2] = color.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox!.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(center);
    mesh.renderOrder = 3;
    const mid = phiStart + phiLength / 2;
    // One hanging crystal per sector, under the crag.
    const crystal = new THREE.Mesh(crystalGeometry, crystals);
    const cr = 1.6 + rand() * 1.8;
    crystal.position.set(Math.sin(mid) * cr - center.x, -3.4 - rand() * 1.6 - center.y, Math.cos(mid) * cr - center.z);
    crystal.scale.setScalar(0.6 + rand() * 0.8);
    mesh.add(crystal);
    group.add(mesh);
    const out = new THREE.Vector3(Math.sin(mid), 0.15 + rand() * 0.3, Math.cos(mid)).normalize();
    chunks.push({
      mesh,
      home: center.clone(),
      out,
      angle: mid,
      seed: rand(),
      spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(1.4)
    });
  }
  return { group, chunks, material, crystals, radius: 6.3 };
}

/* ── the D20 ──────────────────────────────────────────────────────────── */

const D20_VERT = `
attribute float aNum;
varying vec3 vN;
varying vec3 vView;
varying vec2 vUv;
varying float vNum;
varying vec3 vLocal;
void main() {
  vUv = uv;
  vNum = aNum;
  vLocal = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

const D20_FRAG = `
uniform sampler2D uAtlas;
uniform vec3 uBase;
uniform vec3 uGlyph;
uniform vec3 uRim;
uniform vec3 uGoldCol;
uniform vec3 uEmberCol;
uniform vec3 uFrostCol;
uniform float uLit;
uniform float uShow;
uniform float uShowAmt;
uniform float uHeat;
uniform float uGold;
uniform float uCrack;
uniform float uFrost;
uniform float uTime;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vView;
varying vec2 vUv;
varying float vNum;
varying vec3 vLocal;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vView);
  float fres = pow(1.0 - abs(dot(n, v)), 2.0);
  float glyph = texture2D(uAtlas, vUv).a;
  float lit = 1.0 - step(uLit + 0.5, vNum);
  float shown = uShowAmt * (1.0 - step(0.5, abs(vNum - uShow)));
  float light = 0.3 + 0.7 * max(dot(n, normalize(vec3(0.35, 0.8, 0.5))), 0.0);
  vec3 col = uBase * light + uRim * fres * (0.55 + uHeat * 1.2);
  col += uRim * uHeat * 0.18;
  col += uGlyph * glyph * (0.12 + lit * 0.7 + shown * 2.6 + uHeat * 0.4);
  if (uGold > 0.001) {
    col = mix(col, col * uGoldCol * 1.6, uGold * 0.6) + uGoldCol * (glyph * 1.2 + fres * 0.8) * uGold;
  }
  if (uCrack > 0.001) {
    float c = 1.0 - smoothstep(0.0, 0.04, abs(noise(vLocal * 3.0) - 0.5));
    col = mix(col, col * 0.3, uCrack * 0.7);
    col += uEmberCol * c * uCrack * (0.7 + 0.3 * sin(uTime * 3.0));
  }
  if (uFrost > 0.001) {
    float lum = dot(col, vec3(0.3, 0.59, 0.11));
    col = mix(col, uFrostCol * (0.2 + lum * 1.4) + uFrostCol * fres * 0.6, uFrost * 0.85);
  }
  gl_FragColor = vec4(col, uOpacity);
  #include <colorspace_fragment>
}`;

export type D20 = {
  group: THREE.Group;
  uniforms: {
    uLit: { value: number };
    uShow: { value: number };
    uShowAmt: { value: number };
    uHeat: { value: number };
    uGold: { value: number };
    uCrack: { value: number };
    uFrost: { value: number };
    uTime: { value: number };
    uOpacity: { value: number };
  };
  edges: THREE.LineBasicMaterial;
  halo: THREE.Sprite;
  /** Free tumble rate (rad/s) — used when no face is being shown. */
  spin: number;
  /** The number to bring round to face the camera (null = tumble). */
  target: number | null;
  /** 1 = snap the settle hard (a slam), lower = a slow turn. */
  settleRate: number;
  /** Rest on a vertex (the stalemate's impossible balance) instead of a face. */
  balance: boolean;
  update: (dt: number, cameraWorld: THREE.Vector3) => void;
};

/** Number atlas: 5×4 cells, each holding one triangle with its numeral. */
function numberAtlas(font: string) {
  return canvasTexture(1280, 1024, (ctx) => {
    const cw = 256;
    const ch = 256;
    for (let k = 0; k < 20; k += 1) {
      const cx = (k % 5) * cw;
      const cy = Math.floor(k / 5) * ch;
      // Triangle border (uv A(.08,.1) B(.92,.1) C(.5,.95), canvas y flipped).
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx + 0.14 * cw, cy + 0.86 * ch);
      ctx.lineTo(cx + 0.86 * cw, cy + 0.86 * ch);
      ctx.lineTo(cx + 0.5 * cw, cy + 0.12 * ch);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${k + 1 >= 10 ? 78 : 92}px ${font}`;
      ctx.fillText(String(k + 1), cx + 0.5 * cw, cy + 0.6 * ch);
      if (k + 1 === 6 || k + 1 === 9) ctx.fillRect(cx + 0.42 * cw, cy + 0.76 * ch, 0.16 * cw, 7);
    }
  });
}

export function createD20(visual: ThemeVisual, tracker: Tracker, radius: number, glow: THREE.Texture, font: string): D20 {
  const geometry = tracker.track(new THREE.IcosahedronGeometry(radius, 0));
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const faces = pos.count / 3;
  const normals: THREE.Vector3[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let f = 0; f < faces; f += 1) {
    a.fromBufferAttribute(pos, f * 3);
    b.fromBufferAttribute(pos, f * 3 + 1);
    c.fromBufferAttribute(pos, f * 3 + 2);
    normals.push(new THREE.Vector3().addVectors(a, b).add(c).normalize());
  }
  // Number the faces so opposites sum to 21.
  const numbers = new Array<number>(faces).fill(0);
  let next = 1;
  for (let f = 0; f < faces; f += 1) {
    if (numbers[f]) continue;
    let opposite = -1;
    let best = 2;
    for (let g = 0; g < faces; g += 1) {
      const d = normals[f].dot(normals[g]);
      if (g !== f && !numbers[g] && d < best) {
        best = d;
        opposite = g;
      }
    }
    numbers[f] = next;
    if (opposite >= 0) numbers[opposite] = 21 - next;
    next += 1;
  }
  const uv = new Float32Array(pos.count * 2);
  const num = new Float32Array(pos.count);
  const tri = [[0.08, 0.1], [0.92, 0.1], [0.5, 0.95]];
  for (let f = 0; f < faces; f += 1) {
    const k = numbers[f] - 1;
    const u0 = (k % 5) / 5;
    const v0 = 1 - (Math.floor(k / 5) + 1) / 4;
    for (let j = 0; j < 3; j += 1) {
      uv[(f * 3 + j) * 2] = u0 + tri[j][0] / 5;
      uv[(f * 3 + j) * 2 + 1] = v0 + tri[j][1] / 4;
      num[f * 3 + j] = numbers[f];
    }
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute("aNum", new THREE.BufferAttribute(num, 1));
  const atlas = tracker.track(numberAtlas(font));
  atlas.anisotropy = 4;
  const accent = new THREE.Color(visual.accent);
  const uniforms = {
    uAtlas: { value: atlas },
    uBase: { value: new THREE.Color(visual.fog).lerp(accent, 0.18).multiplyScalar(1.6) },
    uGlyph: { value: new THREE.Color(visual.accentBright) },
    uRim: { value: accent.clone() },
    uGoldCol: { value: new THREE.Color("#ffd27a") },
    uEmberCol: { value: new THREE.Color("#ff4a1c") },
    uFrostCol: { value: new THREE.Color("#bcd4ee") },
    uLit: { value: 0 },
    uShow: { value: -1 },
    uShowAmt: { value: 0 },
    uHeat: { value: 0 },
    uGold: { value: 0 },
    uCrack: { value: 0 },
    uFrost: { value: 0 },
    uTime: { value: 0 },
    uOpacity: { value: 1 }
  };
  const material = tracker.track(new THREE.ShaderMaterial({ uniforms, vertexShader: D20_VERT, fragmentShader: D20_FRAG, transparent: true }));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 20;
  const edgesGeometry = tracker.track(new THREE.EdgesGeometry(geometry));
  const edges = tracker.track(new THREE.LineBasicMaterial({ color: new THREE.Color(visual.accentBright), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  const lines = new THREE.LineSegments(edgesGeometry, edges);
  lines.scale.setScalar(1.003);
  lines.renderOrder = 21;
  const spinner = new THREE.Group();
  spinner.add(mesh, lines);
  const halo = new THREE.Sprite(tracker.track(new THREE.SpriteMaterial({ map: glow, color: accent, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })));
  halo.scale.setScalar(radius * 5);
  halo.renderOrder = 19;
  const group = new THREE.Group();
  group.add(halo, spinner);

  const axis = new THREE.Vector3(0.4, 1, 0.2).normalize();
  const spinQuat = new THREE.Quaternion();
  const targetQuat = new THREE.Quaternion();
  const twist = new THREE.Quaternion();
  const toCam = new THREE.Vector3();
  const local = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  // A vertex direction, for the stalemate's balance-on-a-point.
  const vertexDir = new THREE.Vector3().fromBufferAttribute(pos, 0).normalize();
  const faceOf = (n: number) => numbers.indexOf(n);

  const die: D20 = {
    group,
    uniforms,
    edges,
    halo,
    spin: 0.6,
    target: null,
    settleRate: 4,
    balance: false,
    update: (dt, cameraWorld) => {
      if (die.balance) {
        // Rest on a vertex pointing straight down: the impossible balance.
        targetQuat.setFromUnitVectors(vertexDir.clone().negate(), up.clone().negate());
        spinner.quaternion.slerp(targetQuat, 1 - Math.exp(-dt * die.settleRate));
      } else if (die.target === null) {
        axis.applyAxisAngle(up, dt * 0.13).normalize();
        spinQuat.setFromAxisAngle(axis, dt * die.spin);
        spinner.quaternion.premultiply(spinQuat);
      } else {
        const face = faceOf(die.target);
        if (face >= 0) {
          group.updateMatrixWorld();
          toCam.copy(cameraWorld);
          group.worldToLocal(toCam);
          toCam.normalize();
          targetQuat.setFromUnitVectors(normals[face], toCam);
          // Keep the numeral roughly upright: twist about the view axis so
          // the face's "up" (toward its third vertex) points up.
          local.fromBufferAttribute(pos, face * 3 + 2).applyQuaternion(targetQuat).projectOnPlane(toCam).normalize();
          const want = up.clone().projectOnPlane(toCam).normalize();
          const angle = Math.atan2(local.clone().cross(want).dot(toCam), local.dot(want));
          twist.setFromAxisAngle(toCam, angle);
          targetQuat.premultiply(twist);
          spinner.quaternion.slerp(targetQuat, 1 - Math.exp(-dt * die.settleRate));
        }
      }
      uniforms.uTime.value += dt;
    }
  };
  return die;
}
